"use client"; // ボタンで fetch するので client component にする
import Image from "next/image";
import { useState } from "react";

export default function Home() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const handlePost = async () => {
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch("/api/cron");
      const data = await res.json();
      setResult(JSON.stringify(data));
    } catch (err: any) {
      setResult(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="font-sans p-8">
      <h1 className="text-2xl font-bold mb-4">Threads 投稿テスト</h1>

      <button
        onClick={handlePost}
        disabled={loading}
        className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
      >
        {loading ? "投稿中..." : "投稿する"}
      </button>

      {result && (
        <pre className="mt-4 p-2 border rounded bg-gray-100 dark:bg-gray-800">
          {result}
        </pre>
      )}
    </div>
  );
}
