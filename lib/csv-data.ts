/**
 * Dynamic CSV data types - columns from CSV headers become levels
 *
 * Column prefix conventions:
 *   *** = Ignore completely (not shown anywhere)
 *   **  = Card only (shown in detail card but not as a level)
 *   *   = Level + card (shown as drillable level AND in card)
 *   (none) = Level + card (default, same as *)
 */

// Column visibility type
export type ColumnType = "ignore" | "cardOnly" | "level"

// Parsed column info
export interface ColumnInfo {
  originalName: string // Name as it appears in CSV (with prefix)
  displayName: string // Name for display (prefix stripped, made unique)
  type: ColumnType // How to use this column
}

// A record is simply a map of column name -> value
export type DataRecord = Record<string, string> & { __id: string }

// Parsed CSV result
export interface ParsedCSV {
  columns: ColumnInfo[] // Column info in order
  records: DataRecord[] // Data rows (keys are displayName)
  errors: string[] // Problems that stop the file loading
  warnings: string[] // Problems that were worked around
}

/** Placeholder used for blank values when grouping */
export const EMPTY_LABEL = "(empty)"

/**
 * Parse column prefix to determine type and display name
 */
function parseColumnPrefix(header: string): ColumnInfo {
  const h = header.trim()
  if (h.startsWith("***")) {
    return { originalName: h, displayName: h.slice(3).trim(), type: "ignore" }
  }
  if (h.startsWith("**")) {
    return { originalName: h, displayName: h.slice(2).trim(), type: "cardOnly" }
  }
  if (h.startsWith("*")) {
    return { originalName: h, displayName: h.slice(1).trim(), type: "level" }
  }
  return { originalName: h, displayName: h, type: "level" }
}

/**
 * Work out the delimiter from the header line: comma, semicolon or tab.
 * (Excel uses semicolons in some European locales.)
 */
function detectDelimiter(text: string): string {
  const firstLine = text.slice(0, text.search(/\r?\n|$/))
  const counts: Record<string, number> = { ",": 0, ";": 0, "\t": 0 }
  let inQuotes = false
  for (const ch of firstLine) {
    if (ch === '"') inQuotes = !inQuotes
    else if (!inQuotes && ch in counts) counts[ch]++
  }
  let best = ","
  for (const d of [";", "\t"]) {
    if (counts[d] > counts[best]) best = d
  }
  return best
}

/**
 * Split CSV text into rows of fields (RFC 4180 style).
 * Handles quoted fields containing delimiters, doubled quotes ("")
 * and line breaks, plus CRLF / LF / CR line endings.
 */
export function splitCSV(text: string, delimiter = ","): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ""
  let inQuotes = false
  let i = 0

  while (i < text.length) {
    const ch = text[i]

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i += 2
          continue
        }
        inQuotes = false
      } else {
        field += ch
      }
      i++
      continue
    }

    if (ch === '"') {
      inQuotes = true
    } else if (ch === delimiter) {
      row.push(field)
      field = ""
    } else if (ch === "\r" || ch === "\n") {
      row.push(field)
      rows.push(row)
      row = []
      field = ""
      if (ch === "\r" && text[i + 1] === "\n") i++
    } else {
      field += ch
    }
    i++
  }

  // Last field / row (if the file doesn't end with a newline)
  if (field !== "" || row.length > 0) {
    row.push(field)
    rows.push(row)
  }

  return rows
}

/**
 * Parse CSV text into dynamic records
 * The column headers become the level names (respecting prefix conventions)
 */
export function parseCSV(csvText: string): ParsedCSV {
  const errors: string[] = []
  const warnings: string[] = []

  // Strip the byte-order mark Excel adds to "CSV UTF-8" files
  const text = csvText.replace(/^﻿/, "")

  const rows = splitCSV(text, detectDelimiter(text)).filter((r) =>
    r.some((v) => v.trim() !== "")
  )

  if (rows.length < 1) {
    return { columns: [], records: [], errors: ["CSV file is empty"], warnings }
  }

  // Header row
  const columns: ColumnInfo[] = rows[0].map(parseColumnPrefix)
  if (columns.length === 0) {
    return { columns: [], records: [], errors: ["No columns found in CSV header"], warnings }
  }

  // Give blank headers a name, and make duplicate names unique so no data is lost
  const seen = new Map<string, number>()
  columns.forEach((col, idx) => {
    if (!col.displayName) col.displayName = `Column ${idx + 1}`
    if (col.type === "ignore") return
    const key = col.displayName.toLowerCase()
    const n = (seen.get(key) ?? 0) + 1
    seen.set(key, n)
    if (n > 1) {
      const renamed = `${col.displayName} (${n})`
      warnings.push(`Duplicate column "${col.displayName}" renamed to "${renamed}"`)
      col.displayName = renamed
    }
  })

  if (rows.length < 2) {
    return { columns, records: [], errors: ["CSV file must have at least one data row"], warnings }
  }

  const usedColumns = columns.filter((c) => c.type !== "ignore")
  const records: DataRecord[] = []

  for (let i = 1; i < rows.length; i++) {
    const values = rows[i]
    const record: DataRecord = { __id: `row-${i}` }

    columns.forEach((col, j) => {
      if (col.type === "ignore") return
      record[col.displayName] = (values[j] ?? "").trim()
    })

    if (usedColumns.some((col) => record[col.displayName])) {
      records.push(record)
    }
  }

  if (records.length === 0) {
    errors.push("No valid data rows found in CSV file")
  }

  return { columns, records, errors, warnings }
}

// ============================================================
// DATES
// Parsed by hand rather than with `new Date(string)`, which assumes
// US month-first order and accepts things like "Rock 1" as a date.
// ============================================================

const MONTHS: Record<string, number> = {
  jan: 1, january: 1,
  feb: 2, february: 2,
  mar: 3, march: 3,
  apr: 4, april: 4,
  may: 5,
  jun: 6, june: 6,
  jul: 7, july: 7,
  aug: 8, august: 8,
  sep: 9, sept: 9, september: 9,
  oct: 10, october: 10,
  nov: 11, november: 11,
  dec: 12, december: 12,
}

const WEEKDAY = "(?:mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun)[a-z]*,?\\s+"
const MONTH_NAME = "([a-z]{3,9})\\.?"
const DAY = "(\\d{1,2})(?:st|nd|rd|th)?"

const RE_ISO = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s].*)?$/
const RE_NUMERIC = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/ // day first (UK)
const RE_DAY_MONTH_YEAR = new RegExp(`^(?:${WEEKDAY})?${DAY}\\s+(?:of\\s+)?${MONTH_NAME},?\\s+(\\d{4})$`, "i")
const RE_MONTH_DAY_YEAR = new RegExp(`^(?:${WEEKDAY})?${MONTH_NAME}\\s+${DAY},?\\s+(\\d{4})$`, "i")
const RE_MONTH_YEAR = new RegExp(`^${MONTH_NAME}\\s+(\\d{4})$`, "i")

export interface DateParts {
  year: number
  month: number // 1-12
  day: number // 1-31
  hasDay: boolean // false for "March 2026"
}

function makeDate(year: number, month: number, day: number, hasDay = true): DateParts | null {
  if (month < 1 || month > 12 || day < 1) return null
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate()
  if (day > daysInMonth) return null
  return { year, month, day, hasDay }
}

/**
 * Parse a date written in any of the common UK-friendly forms:
 *   2026-04-15, 15/04/2026, 15/04/26, 15.04.2026,
 *   15 April 2026, 15th Apr 2026, Wed 15 April 2026,
 *   April 15, 2026, April 2026
 * Numeric dates are read day-first. Returns null if not a date.
 */
export function parseDate(value: string): DateParts | null {
  const v = value?.trim()
  if (!v) return null

  let m = v.match(RE_ISO)
  if (m) return makeDate(+m[1], +m[2], +m[3])

  m = v.match(RE_NUMERIC)
  if (m) {
    const year = m[3].length === 2 ? 2000 + +m[3] : +m[3]
    return makeDate(year, +m[2], +m[1])
  }

  m = v.match(RE_DAY_MONTH_YEAR)
  if (m) {
    const month = MONTHS[m[2].toLowerCase()]
    return month ? makeDate(+m[3], month, +m[1]) : null
  }

  m = v.match(RE_MONTH_DAY_YEAR)
  if (m) {
    const month = MONTHS[m[1].toLowerCase()]
    return month ? makeDate(+m[3], month, +m[2]) : null
  }

  m = v.match(RE_MONTH_YEAR)
  if (m) {
    const month = MONTHS[m[1].toLowerCase()]
    return month ? makeDate(+m[2], month, 1, false) : null
  }

  return null
}

/**
 * Get a sortable "YYYY-MM-DD" string from a value ("9999-99-99" if not a date).
 * Built from the parsed parts, so there is no time-zone shift.
 */
export function getSortableDate(value: string): string {
  const d = parseDate(value)
  if (!d) return "9999-99-99"
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${String(d.year).padStart(4, "0")}-${pad(d.month)}-${pad(d.day)}`
}

/**
 * Format a date value for display, e.g. "Wed 15 Apr 2026".
 * Returns the original text if it isn't a recognisable date.
 */
export function formatDateValue(value: string): string {
  const d = parseDate(value)
  if (!d) return value
  const date = new Date(Date.UTC(d.year, d.month - 1, d.day))
  if (!d.hasDay) {
    return date.toLocaleDateString("en-GB", { month: "short", year: "numeric", timeZone: "UTC" })
  }
  // e.g. "Wed 15 Apr 2026" (en-GB adds a comma after the weekday; drop it)
  return date
    .toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })
    .replace(",", "")
}

/**
 * A column counts as a date column if at least 80% of its
 * (non-empty) values are recognisable dates.
 */
export function isDateColumn(displayName: string, records: DataRecord[]): boolean {
  const values = records.map((r) => r[displayName]).filter((v) => v && v.trim())
  if (values.length === 0) return false
  const sample = values.slice(0, 50)
  const dateCount = sample.filter((v) => parseDate(v) !== null).length
  return dateCount / sample.length >= 0.8
}

// ============================================================
// LINKS
// ============================================================

/**
 * Check whether a value looks like a web link
 */
export function isUrlValue(value: string): boolean {
  return /^(https?:\/\/|www\.)[^\s]+$/i.test(value.trim())
}

/**
 * Generate sample CSV for template
 * Demonstrates prefix conventions:
 *   *** = ignore, ** = card only, * or none = level + card
 */
export function generateSampleCSV(): string {
  return `Category,Sub Category,Venue,Date,Event Name,**Description,**Ticket Link,***Internal ID
Music,Rock,Royal Albert Hall,15/04/2026,Rock Concert,An amazing rock concert,https://tickets.example.com,INT-001
Music,Jazz,Ronnie Scott's,20/04/2026,Jazz Night,"Smooth jazz evening.
Doors open 7pm.",https://tickets.example.com,INT-002
Theatre,Musical,Victoria Palace Theatre,01/05/2026,Hamilton,Award-winning musical,https://tickets.example.com,INT-003`
}
