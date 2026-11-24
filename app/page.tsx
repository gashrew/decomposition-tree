"use client"

import { useState, useEffect } from "react"
import { FilePicker } from "@/components/file-picker"
import { DynamicTree } from "@/components/dynamic-tree"
import { parseCSV, type ParsedCSV } from "@/lib/csv-data"
import { loadLastFile } from "@/lib/storage"
import { FileText, FolderOpen } from "lucide-react"

export default function Page() {
  const [data, setData] = useState<ParsedCSV | null>(null)
  const [fileName, setFileName] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  // Reload the previously opened file, if there is one
  useEffect(() => {
    let cancelled = false
    loadLastFile().then((saved) => {
      if (cancelled) return
      if (saved) {
        const parsed = parseCSV(saved.text)
        if (parsed.records.length > 0) {
          setData(parsed)
          setFileName(saved.name)
        }
      }
      setIsLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [])

  const handleDataLoaded = (parsed: ParsedCSV, name: string) => {
    setData(parsed)
    setFileName(name)
  }

  const handleChangeFile = () => {
    setData(null)
  }

  if (isLoading) {
    return (
      <main className="min-h-screen bg-[#f3f2f1] flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-[#0078d4] border-t-transparent rounded-full animate-spin" />
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-[#f3f2f1]">
      {/* Header bar */}
      <header className="bg-[#323130] text-white px-5 py-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-7 h-7 shrink-0 rounded bg-[#0078d4] flex items-center justify-center">
            <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none">
              <path d="M2 12V4l5 4-5 4z" fill="white" />
              <path d="M9 12V4l5 4-5 4z" fill="white" opacity="0.6" />
            </svg>
          </div>
          <div className="min-w-0">
            <h1 className="text-sm font-semibold leading-tight">Data Explorer</h1>
            <p className="text-[11px] text-[#a19f9d] leading-tight truncate">
              {data ? `${data.records.length} items from ${fileName}` : "Load a CSV file to start"}
            </p>
          </div>
        </div>

        {data && (
          <button
            type="button"
            onClick={handleChangeFile}
            className="flex shrink-0 items-center gap-1.5 px-3 py-1.5 text-[12px] bg-[#0078d4] hover:bg-[#106ebe] rounded transition-colors"
          >
            <FolderOpen className="w-3.5 h-3.5" />
            Change File
          </button>
        )}
      </header>

      {/* Main content */}
      <div className="p-4">
        {data ? (
          <div className="bg-white rounded shadow-sm border border-[#edebe9] overflow-hidden">
            <DynamicTree data={data} />
          </div>
        ) : (
          <div className="bg-white rounded shadow-sm border border-[#edebe9] p-8">
            <div className="text-center mb-6">
              <div className="w-16 h-16 rounded-full bg-[#f3f2f1] flex items-center justify-center mx-auto mb-4">
                <FileText className="w-8 h-8 text-[#605e5c]" />
              </div>
              <h2 className="text-lg font-semibold text-[#323130]">Load Your Data</h2>
              <p className="text-[13px] text-[#605e5c] mt-1">
                Select a CSV file to explore your data in a tree view
              </p>
            </div>
            <FilePicker onDataLoaded={handleDataLoaded} currentFileName={fileName || undefined} />
          </div>
        )}
      </div>
    </main>
  )
}
