"use client";

import { useState, useEffect } from "react";

// Threads API レスポンス型
interface ThreadsResponse {
  success?: boolean;
  container?: { id?: string; [key: string]: unknown };
  published?: { [key: string]: unknown };
  error?: string;
}

export default function UploadPage() {
  const [uploading, setUploading] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [uploadDate, setUploadDate] = useState<string>("");
  const [uploadedUrls, setUploadedUrls] = useState<string[]>([]);

  const [posting, setPosting] = useState(false);
  const [threadResult, setThreadResult] = useState<ThreadsResponse | null>(null);

  const [notification, setNotification] = useState<string | null>(null);

  // プレビュー用
  const [previews, setPreviews] = useState<string[]>([]);

  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10);
    setUploadDate(today);
  }, []);

  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => setNotification(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  // 選択ファイルのプレビュー生成
  useEffect(() => {
    const urls = selectedFiles.map(file => URL.createObjectURL(file));
    setPreviews(urls);

    // クリーンアップ
    return () => {
      urls.forEach(url => URL.revokeObjectURL(url));
    };
  }, [selectedFiles]);

  const handleUploadFiles = async () => {
    if (selectedFiles.length === 0) {
      alert("ファイルを選択してください");
      return;
    }

    setUploading(true);

    try {
      const uploaded: string[] = [];
      for (const file of selectedFiles) {
        const res = await fetch(`/api/get-s3-url?filename=${uploadDate}_${file.name}`);
        if (!res.ok) throw new Error("署名付きURLの取得に失敗しました");

        const { url, key } = await res.json();
        const putRes = await fetch(url, { method: "PUT", body: file });
        if (!putRes.ok) throw new Error("S3へのアップロードに失敗しました");

        uploaded.push(`https://threadsforautopost.s3.ap-northeast-1.amazonaws.com/${key}`);
      }
      setUploadedUrls(prev => [...prev, ...uploaded]);
      setNotification("アップロード完了しました！");
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : String(err));
    } finally {
      setUploading(false);
    }
  };

  const handlePostToThreads = async () => {
    const confirmPost = window.confirm("本日分をThreadsに投稿しますか？");
    if (!confirmPost) return;

    setPosting(true);
    setThreadResult(null);

    try {
      const res = await fetch(`/api/cron`);
      const data: ThreadsResponse = await res.json();
      setThreadResult(data);

      if (data.success) {
        setNotification("投稿が完了しました！🎉");
      } else {
        setNotification(`投稿に失敗しました: ${data.error ?? "不明なエラー"}`);
      }
    } catch (err: unknown) {
      setNotification(err instanceof Error ? err.message : String(err));
    } finally {
      setPosting(false);
    }
  };

  return (
    <div className="font-sans p-4 max-w-md mx-auto">
      {/* 通知バナー */}
      {notification && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 bg-blue-600 text-white px-4 py-2 rounded shadow-md z-50">
          {notification}
        </div>
      )}

      <h1 className="text-xl font-bold mb-4 text-center">画像アップロード</h1>

      {/* 日付入力 */}
      <div className="mb-4 flex justify-between items-center">
        <label className="mr-2">日付:</label>
        <input
          type="date"
          value={uploadDate}
          onChange={(e) => setUploadDate(e.target.value)}
          className="border px-2 py-1 rounded flex-1"
        />
      </div>

      {/* 画像選択 */}
      <div className="mb-4">
        <input
          type="file"
          accept="image/*"
          multiple
          onChange={(e) => setSelectedFiles(Array.from(e.target.files || []))}
          className="w-full"
        />
        <button
          onClick={handleUploadFiles}
          disabled={uploading || selectedFiles.length === 0 || !uploadDate}
          className="mt-2 w-full px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:bg-gray-400"
        >
          {uploading ? "アップロード中..." : "アップロード"}
        </button>
      </div>

      {/* プレビュー */}
      {previews.length > 0 && (
        <div className="grid grid-cols-3 gap-2 mb-4">
          {previews.map((url, idx) => (
            <img
              key={idx}
              src={url}
              alt={`プレビュー ${idx + 1}`}
              className="w-full h-auto rounded"
              style={{ maxHeight: "150px", objectFit: "cover" }}
            />
          ))}
        </div>
      )}

      {/* アップロード済み画像 */}
      {uploadedUrls.length > 0 && (
        <div className="grid grid-cols-3 gap-2 mb-4">
          {uploadedUrls.map((url, idx) => (
            <a key={idx} href={url} target="_blank" rel="noopener noreferrer">
              <img
                src={url}
                alt={`アップロード済み ${idx + 1}`}
                className="w-full h-auto rounded"
                style={{ maxHeight: "150px", objectFit: "cover" }}
              />
            </a>
          ))}
        </div>
      )}

      <p className="mt-2 text-gray-500 text-sm text-center">
        ※ 投稿はcronで自動的に行われます。
      </p>

      <button
        onClick={handlePostToThreads}
        className="mt-2 w-full px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400"
      >
        {posting ? "投稿中..." : "Threadsに本日分を投稿"}
      </button>

      {threadResult && (
        <div className="mt-4 p-2 border rounded bg-gray-100 dark:bg-gray-800">
          <h2 className="font-semibold mb-2 text-center">投稿結果:</h2>
          <pre className="text-sm overflow-x-auto">{JSON.stringify(threadResult, null, 2)}</pre>
        </div>
      )}
    </div>
  );
}
