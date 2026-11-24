"use client"

import { useState, useCallback, useRef } from "react"
import { FileUp, FileText, X, Download, AlertCircle } from "lucide-react"
import { cn } from "@/lib/utils"
import { parseCSV, generateSampleCSV, type ParsedCSV } from "@/lib/csv-data"
import { saveLastFile } from "@/lib/storage"

interface FilePickerProps {
  onDataLoaded: (data: ParsedCSV, fileName: string) => void
  currentFileName?: string
}

export function FilePicker({ onDataLoaded, currentFileName }: FilePickerProps) {
  const [isDragging, setIsDragging] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const processFile = useCallback(
    async (file: File) => {
      setError(null)
      setIsLoading(true)

      try {
        if (!/\.(csv|tsv|txt)$/i.test(file.name)) {
          setError("Please select a CSV file")
          return
        }

        const text = await file.text()
        const parsed = parseCSV(text)

        if (parsed.errors.length > 0) {
          setError(parsed.errors.join(". "))
          return
        }

        // Remember the file for next time (IndexedDB, so large files are fine)
        await saveLastFile({ name: file.name, text })

        onDataLoaded(parsed, file.name)
      } catch {
        setError("Failed to read file. Please try again.")
      } finally {
        setIsLoading(false)
      }
    },
    [onDataLoaded]
  )

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setIsDragging(false)

      const file = e.dataTransfer.files[0]
      if (file) {
        processFile(file)
      }
    },
    [processFile]
  )

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }, [])

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      // Clear so picking the same file again still triggers a change
      e.target.value = ""
      if (file) {
        processFile(file)
      }
    },
    [processFile]
  )

  const handleBrowseClick = useCallback(() => {
    fileInputRef.current?.click()
  }, [])

  const handleDownloadTemplate = useCallback(() => {
    const csv = generateSampleCSV()
    const blob = new Blob([csv], { type: "text/csv" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = "events_template.csv"
    a.click()
    URL.revokeObjectURL(url)
  }, [])

  return (
    <div className="w-full max-w-xl mx-auto">
      {/* Drop zone */}
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        className={cn(
          "relative border-2 border-dashed rounded-lg p-8 text-center transition-all",
          isDragging
            ? "border-[#0078d4] bg-[#f0f6ff]"
            : "border-[#d2d0ce] bg-[#faf9f8] hover:border-[#8a8886]",
          isLoading && "opacity-60 pointer-events-none"
        )}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values"
          onChange={handleFileSelect}
          className="hidden"
        />

        <div className="flex flex-col items-center gap-3">
          <div
            className={cn(
              "w-12 h-12 rounded-full flex items-center justify-center transition-colors",
              isDragging ? "bg-[#0078d4]" : "bg-[#edebe9]"
            )}
          >
            <FileUp
              className={cn(
                "w-6 h-6 transition-colors",
                isDragging ? "text-white" : "text-[#605e5c]"
              )}
            />
          </div>

          <div>
            <p className="text-[15px] font-medium text-[#323130]">
              {isDragging ? "Drop your CSV file here" : "Drag and drop your CSV file"}
            </p>
            <p className="text-[13px] text-[#605e5c] mt-1">
              or{" "}
              <button
                type="button"
                onClick={handleBrowseClick}
                className="text-[#0078d4] hover:underline font-medium"
              >
                browse to select a file
              </button>
            </p>
          </div>

          {currentFileName && (
            <div className="flex items-center gap-2 px-3 py-1.5 bg-white border border-[#edebe9] rounded-md">
              <FileText className="w-4 h-4 text-[#0078d4]" />
              <span className="text-[13px] text-[#323130]">{currentFileName}</span>
            </div>
          )}
        </div>

        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/80 rounded-lg">
            <div className="w-6 h-6 border-2 border-[#0078d4] border-t-transparent rounded-full animate-spin" />
          </div>
        )}
      </div>

      {/* Error message */}
      {error && (
        <div className="mt-3 flex items-start gap-2 p-3 bg-[#fde7e9] border border-[#f1707b] rounded-md">
          <AlertCircle className="w-4 h-4 text-[#a80000] shrink-0 mt-0.5" />
          <p className="text-[13px] text-[#a80000]">{error}</p>
          <button
            type="button"
            onClick={() => setError(null)}
            className="ml-auto shrink-0 p-0.5 hover:bg-[#f1707b]/20 rounded"
          >
            <X className="w-3.5 h-3.5 text-[#a80000]" />
          </button>
        </div>
      )}

      {/* Template download */}
      <div className="mt-4 text-center">
        <button
          type="button"
          onClick={handleDownloadTemplate}
          className="inline-flex items-center gap-1.5 text-[13px] text-[#605e5c] hover:text-[#323130] transition-colors"
        >
          <Download className="w-3.5 h-3.5" />
          Download CSV template
        </button>
      </div>

      {/* Format hint */}
      <div className="mt-4 p-3 bg-[#f3f2f1] rounded-md">
        <p className="text-[12px] text-[#605e5c] leading-relaxed">
          <strong className="text-[#323130]">CSV Format:</strong> The first row should contain
          column headers. Each column becomes a level in the tree. Dates are read day-first
          (e.g. 15/04/2026), and cells may contain commas or line breaks if quoted.
        </p>
        <p className="text-[12px] text-[#605e5c] leading-relaxed mt-2">
          <strong className="text-[#323130]">Column prefixes:</strong>
        </p>
        <ul className="text-[12px] text-[#605e5c] mt-1 ml-4 list-disc space-y-0.5">
          <li><code className="bg-white px-1 rounded">***</code> Ignore column completely</li>
          <li><code className="bg-white px-1 rounded">**</code> Show in detail card only (not as a level)</li>
          <li><code className="bg-white px-1 rounded">*</code> or no prefix: Show as drillable level + in card</li>
        </ul>
        <p className="text-[12px] text-[#605e5c] leading-relaxed mt-2">
          Example: <code className="bg-white px-1 rounded">Genre,Venue,**Description,***ID</code>
        </p>
      </div>
    </div>
  )
}
