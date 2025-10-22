"use client";

import { useState, useEffect } from "react";
import { ReactSortable } from "react-sortablejs";

interface ThreadsResponse {
  success?: boolean;
  container?: { id?: string; [key: string]: unknown };
  published?: { [key: string]: unknown };
  error?: string;
}

interface ImageItem {
  id: number;
  file?: File;
  url: string;
}

export default function UploadPage() {
  // --- アップロード用ステート ---
  const [uploading, setUploading] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<ImageItem[]>([]);
  const [uploadDate, setUploadDate] = useState<string>("");
  const [uploadedUrls, setUploadedUrls] = useState<ImageItem[]>([]);
  const [posting, setPosting] = useState(false);
  const [threadResult, setThreadResult] = useState<ThreadsResponse | null>(null);

  // --- 通知・IDカウンター ---
  const [notification, setNotification] = useState<string | null>(null);
  const [idCounter, setIdCounter] = useState(0);

  // --- 閲覧用ステート ---
  const [viewDate, setViewDate] = useState<string>("");
  const [viewImages, setViewImages] = useState<ImageItem[]>([]);

  // 初期日付
  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10);
    setUploadDate(today);
    setViewDate(today);
    fetchViewImages(today);
  }, []);

  // 通知タイマー
  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => setNotification(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  // ファイル選択
  const handleFilesChange = (files: FileList | null) => {
    if (!files) return;
    const items: ImageItem[] = Array.from(files).map(file => ({
      id: idCounter + Math.random(),
      file,
      url: URL.createObjectURL(file),
    }));
    setIdCounter(prev => prev + items.length);
    setSelectedFiles(items);
  };

  // 並び順を保持してS3にアップロード
  const handleUploadFiles = async () => {
    if (selectedFiles.length === 0) {
      alert("ファイルを選択してください");
      return;
    }

    setUploading(true);

    try {
      const uploaded: ImageItem[] = [];
      for (const item of selectedFiles) {
        if (!item.file) continue;
        const res = await fetch(`/api/get-s3-url?filename=${uploadDate}_${item.file.name}`);
        if (!res.ok) throw new Error("署名付きURLの取得に失敗しました");
        const { url, key } = await res.json();
        const putRes = await fetch(url, { method: "PUT", body: item.file });
        if (!putRes.ok) throw new Error("S3へのアップロードに失敗しました");

        uploaded.push({ id: item.id, url: `https://threadsforautopost.s3.ap-northeast-1.amazonaws.com/${key}` });
      }

      setUploadedUrls(prev => [...prev, ...uploaded]);
      setSelectedFiles([]); // アップロード済みは選択リストから削除
      setNotification("アップロード完了しました！");
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : String(err));
    } finally {
      setUploading(false);
    }
  };

  // Threads投稿
  const handlePostToThreads = async () => {
    const confirmPost = window.confirm("本日分をThreadsに投稿しますか？");
    if (!confirmPost) return;

    setPosting(true);
    setThreadResult(null);

    try {
      const res = await fetch(`/api/cron`);
      const data: ThreadsResponse = await res.json();
      setThreadResult(data);
      setNotification(data.success ? "投稿が完了しました！🎉" : `投稿に失敗しました: ${data.error ?? "不明なエラー"}`);
    } catch (err: unknown) {
      setNotification(err instanceof Error ? err.message : String(err));
    } finally {
      setPosting(false);
    }
  };

  // --- 閲覧用: 日付変更 ---
  const fetchViewImages = async (date: string) => {
    try {
      const res = await fetch(`/api/get-s3-images?date=${date}`);
      if (!res.ok) throw new Error("画像一覧の取得に失敗しました");
      const data: ImageItem[] = await res.json();
      setViewImages(data);
      if (data.length === 0) setNotification("この日の画像はまだありません");
    } catch (err: unknown) {
      setNotification(err instanceof Error ? err.message : String(err));
      setViewImages([]);
    }
  };

  return (
    <div className="font-sans p-4 max-w-md mx-auto">
      {notification && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 bg-blue-600 text-white px-4 py-2 rounded shadow-md z-50">
          {notification}
        </div>
      )}

      <h1 className="text-xl font-bold mb-4 text-center">画像アップロード</h1>

      {/* アップロード日付 */}
      <div className="mb-4 flex justify-between items-center">
        <label className="mr-2">日付:</label>
        <input
          type="date"
          value={uploadDate}
          onChange={(e) => setUploadDate(e.target.value)}
          className="border px-2 py-1 rounded flex-1"
        />
      </div>

      {/* ファイル選択 */}
      <div className="mb-4">
        <input
          type="file"
          accept="image/*"
          multiple
          onChange={(e) => handleFilesChange(e.target.files)}
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

      {/* 選択中プレビュー */}
      {selectedFiles.length > 0 && (
        <>
          <h2 className="text-sm mb-1">選択中の画像(ドラッグで順序変更可)</h2>
          <ReactSortable
            list={selectedFiles}
            setList={setSelectedFiles}
            className="grid grid-cols-3 gap-2 mb-4"
          >
            {selectedFiles.map(item => (
              <img
                key={item.id}
                src={item.url}
                alt="プレビュー"
                className="w-full h-auto rounded"
                style={{ maxHeight: "150px", objectFit: "cover" }}
              />
            ))}
          </ReactSortable>
        </>
      )}

      <p className="mt-2 text-gray-500 text-sm text-center">
        ※ 投稿はcronで自動的に行われます。
      </p>

      {/* Threads投稿 */}
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

      {/* --- 閲覧用セクション --- */}
      <h2 className="text-lg font-bold mt-6 mb-2 text-center">過去画像の閲覧</h2>
      <div className="mb-4 flex justify-between items-center">
        <label className="mr-2">日付選択:</label>
        <input
          type="date"
          value={viewDate}
          onChange={(e) => {
            const date = e.target.value;
            setViewDate(date);
            fetchViewImages(date);
          }}
          className="border px-2 py-1 rounded flex-1"
        />
      </div>

      {viewImages.length > 0 ? (
        <div className="grid grid-cols-3 gap-2">
          {viewImages.map(img => (
            <a key={img.id} href={img.url} target="_blank" rel="noopener noreferrer">
              <img
                src={img.url}
                alt="閲覧画像"
                className="w-full h-auto rounded"
                style={{ maxHeight: "150px", objectFit: "cover" }}
              />
            </a>
          ))}
        </div>
      ) : (
        <p className="text-center text-gray-500">この日の画像はありません</p>
      )}
    </div>
  );
}
