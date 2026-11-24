"use client"

import React from "react"
import { useState, useRef, useEffect, useLayoutEffect, useCallback, useMemo } from "react"
import {
  ChevronRight,
  ChevronDown,
  ChevronLeft,
  ChevronUp,
  ExternalLink,
  X,
  GripVertical,
  ArrowRightLeft,
  ArrowDownUp,
  RotateCcw,
  Eye,
  EyeOff,
  Tag,
  AlertTriangle,
} from "lucide-react"
import { cn } from "@/lib/utils"
import {
  type DataRecord,
  type ParsedCSV,
  EMPTY_LABEL,
  isDateColumn,
  isUrlValue,
  getSortableDate,
  formatDateValue,
} from "@/lib/csv-data"
import { readSetting, writeSetting } from "@/lib/storage"

// ============================================================
// LEVEL COLORS - one per hierarchy depth
// ============================================================

const LEVEL_COLORS = [
  { bg: "#118dff", text: "white" },
  { bg: "#12239e", text: "white" },
  { bg: "#e66c37", text: "white" },
  { bg: "#6b007b", text: "white" },
  { bg: "#0078d4", text: "white" },
  { bg: "#e044a7", text: "white" },
  { bg: "#1aab40", text: "white" },
  { bg: "#f2c811", text: "#323130" },
]

const DISABLED_COLOR = { bg: "#a19f9d", text: "white" }

function colorAt(depth: number) {
  return LEVEL_COLORS[depth % LEVEL_COLORS.length]
}

// ============================================================
// DYNAMIC GROUPING
// ============================================================

function valueOf(r: DataRecord, column: string): string {
  return r[column] || EMPTY_LABEL
}

function groupBy(records: DataRecord[], column: string): Map<string, DataRecord[]> {
  const map = new Map<string, DataRecord[]>()
  for (const r of records) {
    const val = valueOf(r, column)
    const list = map.get(val)
    if (list) list.push(r)
    else map.set(val, [r])
  }
  return map
}

const naturalCompare = new Intl.Collator("en-GB", { numeric: true, sensitivity: "base" }).compare

/**
 * Sort a level's values: chronologically for date columns, otherwise
 * naturally (so "Item 2" comes before "Item 10"). "(empty)" always goes last.
 */
function sortGroupKeys(groups: Map<string, DataRecord[]>, isDate: boolean): string[] {
  return Array.from(groups.keys()).sort((a, b) => {
    if (a === EMPTY_LABEL) return 1
    if (b === EMPTY_LABEL) return -1
    if (isDate) {
      const cmp = getSortableDate(a).localeCompare(getSortableDate(b))
      if (cmp !== 0) return cmp
    }
    return naturalCompare(a, b)
  })
}

/** Earliest date in a group, from the given date column */
function earliestDate(records: DataRecord[], dateColumn: string): string | null {
  let best: string | null = null
  let bestSort = "9999-99-99"
  for (const r of records) {
    const s = getSortableDate(r[dateColumn])
    if (s < bestSort) {
      bestSort = s
      best = r[dateColumn]
    }
  }
  return best
}

// ============================================================
// CONNECTOR LINES (horizontal layout)
// Measured from the real positions of the bars, so they stay
// aligned when long labels wrap onto several lines.
// ============================================================

function HConnector({
  fromColumn,
  toColumn,
  selectedKey,
  color,
  layoutKey,
}: {
  fromColumn: HTMLDivElement | null
  toColumn: HTMLDivElement | null
  selectedKey: string | null
  color: string
  layoutKey: string
}) {
  const svgWrapRef = useRef<HTMLDivElement>(null)
  const [geom, setGeom] = useState<{ fromY: number; toYs: number[]; height: number } | null>(null)

  const measure = useCallback(() => {
    const wrap = svgWrapRef.current
    if (!wrap || !fromColumn || !toColumn || !selectedKey) {
      setGeom(null)
      return
    }
    const top = wrap.getBoundingClientRect().top
    const centre = (el: Element) => {
      const r = el.getBoundingClientRect()
      return r.top - top + r.height / 2
    }
    const fromEl = Array.from(fromColumn.querySelectorAll<HTMLElement>("[data-node-key]")).find(
      (el) => el.dataset.nodeKey === selectedKey
    )
    const toEls = Array.from(toColumn.querySelectorAll<HTMLElement>("[data-node-key]"))
    if (!fromEl || toEls.length === 0) {
      setGeom(null)
      return
    }
    const fromY = centre(fromEl)
    const toYs = toEls.map(centre)
    setGeom({ fromY, toYs, height: Math.max(fromY, ...toYs) + 20 })
  }, [fromColumn, toColumn, selectedKey])

  useLayoutEffect(() => {
    measure()
  }, [measure, layoutKey])

  useEffect(() => {
    if (!fromColumn || !toColumn) return
    const ro = new ResizeObserver(() => measure())
    ro.observe(fromColumn)
    ro.observe(toColumn)
    return () => ro.disconnect()
  }, [fromColumn, toColumn, measure])

  return (
    <div ref={svgWrapRef} className="shrink-0 w-10 self-stretch relative">
      {geom && (
        <svg width={40} height={geom.height} className="absolute top-0 left-0 overflow-visible">
          {geom.toYs.map((toY, i) => (
            <path
              key={i}
              d={`M 0 ${geom.fromY} C 20 ${geom.fromY}, 20 ${toY}, 40 ${toY}`}
              fill="none"
              stroke={color}
              strokeWidth={1}
              opacity={0.45}
            />
          ))}
        </svg>
      )}
    </div>
  )
}

function VLevelDivider({ depth }: { depth: number }) {
  const c = colorAt(depth)
  return (
    <div className="w-full flex items-center gap-3 py-2">
      <div className="flex-1 h-px" style={{ backgroundColor: c.bg, opacity: 0.25 }} />
      <ChevronDown className="w-3.5 h-3.5" style={{ color: c.bg, opacity: 0.5 }} />
      <div className="flex-1 h-px" style={{ backgroundColor: c.bg, opacity: 0.25 }} />
    </div>
  )
}

// ============================================================
// NODE BAR
// ============================================================

function NodeBar({
  nodeKey,
  label,
  count,
  depth,
  isSelected,
  onSelect,
  orientation,
}: {
  nodeKey: string
  label: string
  count: number
  depth: number
  isSelected: boolean
  onSelect: () => void
  orientation: "horizontal" | "vertical"
}) {
  const c = colorAt(depth)
  const isH = orientation === "horizontal"

  return (
    <button
      type="button"
      data-node-key={nodeKey}
      onClick={onSelect}
      aria-pressed={isSelected}
      className={cn(
        "group flex items-center gap-1.5 rounded-[3px] px-1 py-[3px] text-left transition-all duration-100",
        "hover:bg-[#f3f2f1]",
        isSelected && "bg-[#edebe9]",
        "w-full"
      )}
    >
      <div
        className={cn(
          "relative flex items-center gap-2 rounded-[2px] px-3 py-1 transition-all duration-200 w-full",
          isSelected && "ring-2 ring-offset-1",
          "min-h-[28px] min-w-0 flex-1"
        )}
        style={{
          backgroundColor: c.bg,
          color: c.text,
          ["--tw-ring-color" as string]: c.bg,
        }}
      >
        <span className="text-[13px] font-medium break-words min-w-0" style={{ color: c.text }}>
          {label}
        </span>
        <span className="ml-auto text-[11px] opacity-70 shrink-0 tabular-nums" style={{ color: c.text }}>
          {count}
        </span>
      </div>

      {isH && (
        <ChevronRight
          className={cn(
            "w-3.5 h-3.5 shrink-0 transition-colors",
            isSelected ? "text-[#323130]" : "text-[#c8c6c4]"
          )}
        />
      )}
    </button>
  )
}

// ============================================================
// LEVEL GROUP
// ============================================================

function LevelGroup({
  containerRef,
  levelLabel,
  keys,
  groups,
  selectedKey,
  depth,
  onSelect,
  onRemove,
  orientation,
  labelDateColumn,
}: {
  containerRef: (el: HTMLDivElement | null) => void
  levelLabel: string
  keys: string[]
  groups: Map<string, DataRecord[]>
  selectedKey: string | null
  depth: number
  onSelect: (key: string) => void
  onRemove?: () => void
  orientation: "horizontal" | "vertical"
  /** If set, each bar shows the earliest date in its group from this column */
  labelDateColumn: string | null
}) {
  const c = colorAt(depth)
  const isH = orientation === "horizontal"

  return (
    <div ref={containerRef} className={cn("shrink-0", isH ? "min-w-[200px] max-w-[280px]" : "w-full")}>
      {/* Header */}
      <div className="flex items-center gap-2 mb-2 px-1 min-h-[20px]">
        <div className="w-1.5 h-3.5 rounded-sm" style={{ backgroundColor: c.bg }} />
        <span className="text-[11px] font-semibold text-[#605e5c] uppercase tracking-wider">{levelLabel}</span>
        {depth > 0 && onRemove && (
          <button
            type="button"
            onClick={onRemove}
            className="ml-auto p-0.5 hover:bg-[#f3f2f1] rounded transition-colors"
            title="Collapse this level"
          >
            <X className="w-3 h-3 text-[#a19f9d] hover:text-[#605e5c]" />
          </button>
        )}
      </div>

      {/* Items */}
      <div className="flex flex-col gap-[2px]">
        {keys.map((key) => {
          const recordsInGroup = groups.get(key)!
          let displayLabel = key

          if (labelDateColumn) {
            const d = earliestDate(recordsInGroup, labelDateColumn)
            if (d) displayLabel = `${key} – ${formatDateValue(d)}`
          }

          return (
            <NodeBar
              key={key}
              nodeKey={key}
              label={displayLabel}
              count={recordsInGroup.length}
              depth={depth}
              isSelected={selectedKey === key}
              onSelect={() => onSelect(key)}
              orientation={orientation}
            />
          )
        })}
      </div>
    </div>
  )
}

// ============================================================
// DETAIL PANEL - one card per matching row
// ============================================================

function DetailCard({
  record,
  titleColumn,
  bodyColumns,
  dateColumns,
  onClose,
}: {
  record: DataRecord
  titleColumn: string
  bodyColumns: string[]
  dateColumns: string[]
  onClose?: () => void
}) {
  const title = record[titleColumn] || "Details"

  return (
    <div className="bg-white border border-[#edebe9] rounded-md shadow-lg overflow-hidden">
      <div className="px-4 py-3 flex items-start justify-between gap-2" style={{ backgroundColor: "#0078d4" }}>
        <h3 className="text-sm font-semibold leading-tight text-white break-words">{title}</h3>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 p-0.5 hover:bg-white/20 rounded transition-colors"
            title="Close"
          >
            <X className="w-3.5 h-3.5 text-white" />
          </button>
        )}
      </div>

      <div className="p-4 flex flex-col gap-3">
        {bodyColumns.map((col) => {
          const value = record[col]
          if (!value) return null

          return (
            <div key={col} className="flex flex-col gap-0.5">
              <span className="text-[11px] font-semibold text-[#605e5c] uppercase tracking-wider">{col}</span>
              {isUrlValue(value) ? (
                <a
                  href={/^https?:\/\//i.test(value) ? value : `https://${value}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-[13px] text-[#0078d4] hover:underline break-all"
                >
                  {value}
                  <ExternalLink className="w-3 h-3 shrink-0" />
                </a>
              ) : (
                <p className="text-[13px] text-[#323130] break-words whitespace-pre-wrap">
                  {dateColumns.includes(col) ? formatDateValue(value) : value}
                </p>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function DetailPanel({
  records,
  titleColumn,
  bodyColumns,
  dateColumns,
  onClose,
  orientation,
}: {
  records: DataRecord[]
  titleColumn: string
  bodyColumns: string[]
  dateColumns: string[]
  onClose: () => void
  orientation: "horizontal" | "vertical"
}) {
  const isH = orientation === "horizontal"
  return (
    <div className={cn("shrink-0 flex flex-col gap-3", isH ? "min-w-[280px] max-w-[400px]" : "w-full")}>
      {records.length > 1 && (
        <div className="flex items-center justify-between px-1">
          <span className="text-[11px] font-semibold text-[#605e5c] uppercase tracking-wider">
            {records.length} matching rows
          </span>
          <button
            type="button"
            onClick={onClose}
            className="p-0.5 hover:bg-[#f3f2f1] rounded transition-colors"
            title="Close"
          >
            <X className="w-3 h-3 text-[#a19f9d]" />
          </button>
        </div>
      )}
      {records.map((r) => (
        <DetailCard
          key={r.__id}
          record={r}
          titleColumn={titleColumn}
          bodyColumns={bodyColumns}
          dateColumns={dateColumns}
          onClose={records.length === 1 ? onClose : undefined}
        />
      ))}
    </div>
  )
}

// ============================================================
// TOOLBAR
// ============================================================

function Toolbar({
  levelOrder,
  allColumns,
  onReorder,
  onReset,
  orientation,
  onToggleOrientation,
  disabledLevels,
  onToggleLevel,
  showDatesOnLabels,
  onToggleShowDates,
  hasDateColumns,
}: {
  levelOrder: string[]
  allColumns: string[]
  onReorder: (newOrder: string[]) => void
  onReset: () => void
  orientation: "horizontal" | "vertical"
  onToggleOrientation: () => void
  disabledLevels: Set<string>
  onToggleLevel: (col: string) => void
  showDatesOnLabels: boolean
  onToggleShowDates: () => void
  hasDateColumns: boolean
}) {
  const [dragIdx, setDragIdx] = useState<number | null>(null)
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null)

  const move = (from: number, to: number) => {
    if (to < 0 || to >= levelOrder.length || from === to) return
    const newOrder = [...levelOrder]
    const [moved] = newOrder.splice(from, 1)
    newOrder.splice(to, 0, moved)
    onReorder(newOrder)
  }

  const handleDrop = (idx: number) => {
    if (dragIdx !== null) move(dragIdx, idx)
    setDragIdx(null)
    setDragOverIdx(null)
  }
  const handleDragEnd = () => {
    setDragIdx(null)
    setDragOverIdx(null)
  }

  const isDefault =
    levelOrder.length === allColumns.length &&
    levelOrder.every((k, i) => k === allColumns[i]) &&
    disabledLevels.size === 0

  // Colours follow the position among *visible* levels, matching the tree
  let visibleIdx = 0

  return (
    <div className="flex flex-col gap-2">
      {/* Level pills */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:flex-wrap">
        <span className="text-[11px] font-semibold text-[#605e5c] uppercase tracking-wider mr-1">Levels:</span>
        {levelOrder.map((col, idx) => {
          const isDisabled = disabledLevels.has(col)
          const c = isDisabled ? DISABLED_COLOR : colorAt(visibleIdx++)
          const arrowBtn =
            "flex items-center justify-center w-5 self-stretch transition-colors hover:brightness-110 disabled:opacity-30 disabled:cursor-default"
          return (
            <div key={col} className="flex items-center">
              <div
                className={cn(
                  "flex items-stretch rounded-md overflow-hidden transition-all select-none",
                  isDisabled && "opacity-50",
                  dragIdx === idx && "opacity-40 scale-95",
                  dragOverIdx === idx && dragIdx !== idx && "ring-2 ring-[#118dff] ring-offset-1"
                )}
                style={{ backgroundColor: c.bg }}
              >
                <div
                  draggable
                  onDragStart={() => setDragIdx(idx)}
                  onDragOver={(e) => {
                    e.preventDefault()
                    setDragOverIdx(idx)
                  }}
                  onDrop={() => handleDrop(idx)}
                  onDragEnd={handleDragEnd}
                  className="flex items-center gap-1 pl-2 pr-1 py-1 cursor-grab active:cursor-grabbing"
                >
                  <GripVertical className="w-3 h-3 hidden sm:block" style={{ color: c.text, opacity: 0.6 }} />
                  <span className={cn("text-[12px] font-medium", isDisabled && "line-through")} style={{ color: c.text }}>
                    {col}
                  </span>
                </div>
                {/* Move buttons - these work on touch screens, where dragging doesn't */}
                <button
                  type="button"
                  onClick={() => move(idx, idx - 1)}
                  disabled={idx === 0}
                  className={arrowBtn}
                  title={`Move ${col} earlier`}
                  aria-label={`Move ${col} earlier`}
                >
                  <ChevronUp className="w-3 h-3 sm:hidden" style={{ color: c.text }} />
                  <ChevronLeft className="w-3 h-3 hidden sm:block" style={{ color: c.text }} />
                </button>
                <button
                  type="button"
                  onClick={() => move(idx, idx + 1)}
                  disabled={idx === levelOrder.length - 1}
                  className={arrowBtn}
                  title={`Move ${col} later`}
                  aria-label={`Move ${col} later`}
                >
                  <ChevronDown className="w-3 h-3 sm:hidden" style={{ color: c.text }} />
                  <ChevronRight className="w-3 h-3 hidden sm:block" style={{ color: c.text }} />
                </button>
                <button
                  type="button"
                  onClick={() => onToggleLevel(col)}
                  className="flex items-center justify-center w-6 self-stretch border-l border-white/20 transition-colors hover:brightness-110"
                  title={isDisabled ? `Show ${col} level` : `Hide ${col} level`}
                  aria-label={isDisabled ? `Show ${col} level` : `Hide ${col} level`}
                >
                  {isDisabled ? (
                    <EyeOff className="w-3 h-3" style={{ color: c.text, opacity: 0.8 }} />
                  ) : (
                    <Eye className="w-3 h-3" style={{ color: c.text, opacity: 0.8 }} />
                  )}
                </button>
              </div>
              {idx < levelOrder.length - 1 && (
                <ChevronRight className="w-3 h-3 mx-0.5 shrink-0 text-[#a19f9d] hidden sm:block" />
              )}
            </div>
          )
        })}
      </div>

      {/* Action buttons */}
      <div className="flex flex-wrap items-center gap-1">
        {!isDefault && (
          <button
            type="button"
            onClick={onReset}
            className="flex items-center gap-1.5 px-2 py-1 text-[12px] text-[#605e5c] hover:bg-[#f3f2f1] rounded transition-colors"
          >
            <RotateCcw className="w-3 h-3" />
            Reset
          </button>
        )}
        {hasDateColumns && (
          <button
            type="button"
            onClick={onToggleShowDates}
            className={cn(
              "flex items-center gap-1.5 px-2 py-1 text-[12px] rounded transition-colors border",
              showDatesOnLabels
                ? "bg-[#0078d4] text-white border-[#0078d4]"
                : "text-[#605e5c] hover:bg-[#f3f2f1] border-[#edebe9]"
            )}
            title={showDatesOnLabels ? "Hide dates on labels" : "Show the earliest date on each label"}
          >
            <Tag className="w-3 h-3" />
            <span>Show Dates</span>
          </button>
        )}
        <button
          type="button"
          onClick={onToggleOrientation}
          className="flex items-center gap-1.5 px-2 py-1 text-[12px] text-[#605e5c] hover:bg-[#f3f2f1] rounded transition-colors border border-[#edebe9]"
          title={`Switch to ${orientation === "horizontal" ? "vertical" : "horizontal"} layout`}
        >
          {orientation === "horizontal" ? (
            <>
              <ArrowDownUp className="w-3 h-3" />
              Vertical
            </>
          ) : (
            <>
              <ArrowRightLeft className="w-3 h-3" />
              Horizontal
            </>
          )}
        </button>
      </div>
    </div>
  )
}

// ============================================================
// BREADCRUMBS
// ============================================================

function Breadcrumbs({
  path,
  onNavigateTo,
}: {
  path: { column: string; value: string }[]
  onNavigateTo: (depth: number) => void
}) {
  if (path.length === 0) return null

  return (
    <nav className="flex items-center gap-1 flex-wrap" aria-label="Breadcrumb">
      <button type="button" onClick={() => onNavigateTo(-1)} className="text-[12px] hover:underline" style={{ color: "#0078d4" }}>
        All Items
      </button>
      {path.map((item, idx) => {
        const c = colorAt(idx)
        const isLast = idx === path.length - 1
        return (
          <span key={`${item.column}-${item.value}`} className="flex items-center gap-1">
            <ChevronRight className="w-3 h-3 text-[#a19f9d]" />
            {isLast ? (
              <span className="text-[12px] font-medium text-[#323130]">{item.value}</span>
            ) : (
              <button type="button" onClick={() => onNavigateTo(idx)} className="text-[12px] hover:underline" style={{ color: c.bg }}>
                {item.value}
              </button>
            )}
          </span>
        )
      })}
    </nav>
  )
}

// ============================================================
// SAVED SETTINGS
// ============================================================

interface TreeSettings {
  levelOrder: string[]
  disabledLevels: string[]
  orientation: "horizontal" | "vertical"
  showDatesOnLabels: boolean
}

/** Settings are remembered per set of columns, so each file layout keeps its own */
function settingsKey(levelColumns: string[]) {
  return `tree-settings:${levelColumns.join("|")}`
}

function loadSettings(levelColumns: string[]): TreeSettings | null {
  const s = readSetting<TreeSettings>(settingsKey(levelColumns))
  if (!s || !Array.isArray(s.levelOrder)) return null
  // Only use the saved order if it has exactly the same columns
  const same =
    s.levelOrder.length === levelColumns.length && levelColumns.every((c) => s.levelOrder.includes(c))
  if (!same) return null
  return {
    levelOrder: s.levelOrder,
    disabledLevels: (s.disabledLevels ?? []).filter((c) => levelColumns.includes(c)),
    orientation: s.orientation === "vertical" ? "vertical" : "horizontal",
    showDatesOnLabels: !!s.showDatesOnLabels,
  }
}

// ============================================================
// MAIN COMPONENT
// ============================================================

interface DynamicTreeProps {
  data: ParsedCSV
}

export function DynamicTree({ data }: DynamicTreeProps) {
  const { columns, records, warnings } = data

  const levelColumns = useMemo(
    () => columns.filter((c) => c.type === "level").map((c) => c.displayName),
    [columns]
  )
  const cardOnlyColumns = useMemo(
    () => columns.filter((c) => c.type === "cardOnly").map((c) => c.displayName),
    [columns]
  )

  // State
  const [levelOrder, setLevelOrder] = useState<string[]>(levelColumns)
  const [disabledLevels, setDisabledLevels] = useState<Set<string>>(new Set())
  const [selections, setSelections] = useState<string[]>([])
  const [orientation, setOrientation] = useState<"horizontal" | "vertical">("horizontal")
  const [showDatesOnLabels, setShowDatesOnLabels] = useState(false)
  const [showWarnings, setShowWarnings] = useState(true)
  const [loadedKey, setLoadedKey] = useState<string | null>(null)

  const scrollRef = useRef<HTMLDivElement>(null)
  const [columnEls, setColumnEls] = useState<(HTMLDivElement | null)[]>([])
  const columnRefCallbacks = useRef<((el: HTMLDivElement | null) => void)[]>([])
  const columnRef = (idx: number) => {
    if (!columnRefCallbacks.current[idx]) {
      columnRefCallbacks.current[idx] = (el) =>
        setColumnEls((prev) => {
          if (prev[idx] === el) return prev
          const next = [...prev]
          next[idx] = el
          return next
        })
    }
    return columnRefCallbacks.current[idx]
  }

  // Load saved settings (or defaults) when the data changes
  useEffect(() => {
    const saved = loadSettings(levelColumns)
    setLevelOrder(saved?.levelOrder ?? levelColumns)
    setDisabledLevels(new Set(saved?.disabledLevels ?? []))
    setOrientation(saved?.orientation ?? "horizontal")
    setShowDatesOnLabels(saved?.showDatesOnLabels ?? false)
    setSelections([])
    setShowWarnings(true)
    setLoadedKey(settingsKey(levelColumns))
  }, [levelColumns])

  // Save settings whenever they change (but not before they've been loaded)
  useEffect(() => {
    const key = settingsKey(levelColumns)
    if (loadedKey !== key) return
    writeSetting(key, {
      levelOrder,
      disabledLevels: Array.from(disabledLevels),
      orientation,
      showDatesOnLabels,
    } satisfies TreeSettings)
  }, [loadedKey, levelColumns, levelOrder, disabledLevels, orientation, showDatesOnLabels])

  // Date columns (levels and card-only)
  const dateColumns = useMemo(
    () => [...levelColumns, ...cardOnlyColumns].filter((col) => isDateColumn(col, records)),
    [levelColumns, cardOnlyColumns, records]
  )

  const effectiveLevelOrder = useMemo(
    () => levelOrder.filter((col) => !disabledLevels.has(col)),
    [levelOrder, disabledLevels]
  )

  // Auto-scroll to the newest level
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    if (orientation === "horizontal") {
      el.scrollTo({ left: el.scrollWidth, behavior: "smooth" })
    } else {
      el.scrollTo({ top: el.scrollHeight, behavior: "smooth" })
    }
  }, [selections, orientation])

  // Handlers
  const handleReorder = useCallback((newOrder: string[]) => {
    setLevelOrder(newOrder)
    setSelections([])
  }, [])

  const handleReset = useCallback(() => {
    setLevelOrder(levelColumns)
    setDisabledLevels(new Set())
    setSelections([])
  }, [levelColumns])

  const handleToggleLevel = useCallback(
    (col: string) => {
      const newDisabled = new Set(disabledLevels)
      if (newDisabled.has(col)) {
        newDisabled.delete(col)
      } else {
        const enabledCount = levelOrder.filter((k) => !newDisabled.has(k)).length
        if (enabledCount <= 1) return
        newDisabled.add(col)
      }
      setDisabledLevels(newDisabled)
      setSelections([])
    },
    [disabledLevels, levelOrder]
  )

  const handleSelect = useCallback((depth: number, key: string) => {
    setSelections((prev) => {
      const next = prev.slice(0, depth)
      next[depth] = key
      return next
    })
  }, [])

  const handleRemove = useCallback((depth: number) => {
    setSelections((prev) => prev.slice(0, depth))
  }, [])

  const handleBreadcrumbNav = useCallback((depth: number) => {
    setSelections((prev) => (depth < 0 ? [] : prev.slice(0, depth + 1)))
  }, [])

  // Build the visible levels, and the rows matching every selection
  const { displayColumns, leafRecords } = useMemo(() => {
    const cols: {
      column: string
      groups: Map<string, DataRecord[]>
      keys: string[]
      selectedKey: string | null
      depth: number
    }[] = []

    let filtered = records
    let complete = true

    for (let depth = 0; depth < effectiveLevelOrder.length; depth++) {
      const col = effectiveLevelOrder[depth]
      const groups = groupBy(filtered, col)
      const selectedKey = selections[depth] && groups.has(selections[depth]) ? selections[depth] : null

      cols.push({
        column: col,
        groups,
        keys: sortGroupKeys(groups, dateColumns.includes(col)),
        selectedKey,
        depth,
      })

      if (!selectedKey) {
        complete = false
        break
      }
      filtered = groups.get(selectedKey)!
    }

    return { displayColumns: cols, leafRecords: complete && filtered.length > 0 ? filtered : null }
  }, [effectiveLevelOrder, selections, records, dateColumns])

  // Card: title is the deepest level; body shows every other column
  const cardTitleColumn = effectiveLevelOrder[effectiveLevelOrder.length - 1]
  const cardBodyColumns = useMemo(
    () => [...levelOrder, ...cardOnlyColumns].filter((c) => c !== cardTitleColumn),
    [levelOrder, cardOnlyColumns, cardTitleColumn]
  )

  // Which date column to show on bar labels (the first one that isn't the level itself)
  const labelDateColumnFor = (col: string) =>
    showDatesOnLabels ? dateColumns.find((d) => d !== col) ?? null : null

  const breadcrumbPath = displayColumns
    .filter((c) => c.selectedKey)
    .map((c) => ({ column: c.column, value: c.selectedKey! }))

  const isH = orientation === "horizontal"
  const layoutKey = `${orientation}|${showDatesOnLabels}|${selections.join("\u0000")}|${effectiveLevelOrder.join("|")}`

  return (
    <div className="relative w-full min-h-[400px] bg-white p-4 md:p-5 overflow-hidden flex flex-col gap-3">
      {/* Title */}
      <div>
        <h2 className="text-base font-semibold text-[#323130]">Data Explorer</h2>
        <p className="text-[12px] text-[#605e5c]">
          {records.length} items loaded. Drag levels (or use the arrows) to reorder, click to drill down.
        </p>
      </div>

      {/* Warnings from loading */}
      {showWarnings && warnings.length > 0 && (
        <div className="flex items-start gap-2 p-2.5 bg-[#fff4ce] border border-[#f2c811] rounded-md">
          <AlertTriangle className="w-4 h-4 text-[#8a6d00] shrink-0 mt-0.5" />
          <ul className="text-[12px] text-[#5c4a00] space-y-0.5">
            {warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
          <button
            type="button"
            onClick={() => setShowWarnings(false)}
            className="ml-auto shrink-0 p-0.5 hover:bg-black/5 rounded"
            title="Dismiss"
          >
            <X className="w-3.5 h-3.5 text-[#5c4a00]" />
          </button>
        </div>
      )}

      <Toolbar
        levelOrder={levelOrder}
        allColumns={levelColumns}
        onReorder={handleReorder}
        onReset={handleReset}
        orientation={orientation}
        onToggleOrientation={() => setOrientation((o) => (o === "horizontal" ? "vertical" : "horizontal"))}
        disabledLevels={disabledLevels}
        onToggleLevel={handleToggleLevel}
        showDatesOnLabels={showDatesOnLabels}
        onToggleShowDates={() => setShowDatesOnLabels((v) => !v)}
        hasDateColumns={dateColumns.length > 0}
      />

      <Breadcrumbs path={breadcrumbPath} onNavigateTo={handleBreadcrumbNav} />

      {/* Tree area */}
      <div
        ref={scrollRef}
        className={cn("flex-1 overflow-auto pb-4", isH ? "flex items-start gap-0" : "flex flex-col gap-0")}
      >
        {displayColumns.map((col, idx) => {
          const prevCol = idx > 0 ? displayColumns[idx - 1] : null
          return (
            <React.Fragment key={`${col.column}-${idx}`}>
              {prevCol &&
                (isH ? (
                  <HConnector
                    fromColumn={columnEls[idx - 1] ?? null}
                    toColumn={columnEls[idx] ?? null}
                    selectedKey={prevCol.selectedKey}
                    color={colorAt(col.depth).bg}
                    layoutKey={layoutKey}
                  />
                ) : (
                  <VLevelDivider depth={col.depth} />
                ))}

              <LevelGroup
                containerRef={columnRef(idx)}
                levelLabel={col.column}
                keys={col.keys}
                groups={col.groups}
                selectedKey={col.selectedKey}
                depth={col.depth}
                onSelect={(key) => handleSelect(col.depth, key)}
                onRemove={col.depth > 0 ? () => handleRemove(col.depth) : undefined}
                orientation={orientation}
                labelDateColumn={labelDateColumnFor(col.column)}
              />
            </React.Fragment>
          )
        })}

        {/* Detail cards */}
        {leafRecords && (
          <>
            {isH ? <div className="shrink-0 w-6" /> : <div className="shrink-0 h-3" />}
            <DetailPanel
              records={leafRecords}
              titleColumn={cardTitleColumn}
              bodyColumns={cardBodyColumns}
              dateColumns={dateColumns}
              onClose={() => setSelections((prev) => prev.slice(0, prev.length - 1))}
              orientation={orientation}
            />
          </>
        )}
      </div>

      {selections.length === 0 && (
        <div className="text-center text-[13px] text-[#a19f9d] py-2">Click a category to start exploring</div>
      )}
    </div>
  )
}
