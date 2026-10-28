import { useMemo, useState, type ReactNode } from 'react'

export interface Column<T> {
  key: string
  header: string
  value: (row: T) => string | number
  render?: (row: T) => ReactNode
  numeric?: boolean
}

/** Sortable table. Click a header button to sort, and aria-sort tells screen readers about it. */
export function DataTable<T>({
  caption,
  columns,
  rows,
  rowKey,
  initialSort,
}: {
  caption: string
  columns: Column<T>[]
  rows: T[]
  rowKey: (row: T) => string
  initialSort?: { key: string; direction: 'ascending' | 'descending' }
}) {
  const [sort, setSort] = useState(initialSort ?? { key: columns[0].key, direction: 'ascending' as const })

  const sorted = useMemo(() => {
    const column = columns.find((c) => c.key === sort.key) ?? columns[0]
    const factor = sort.direction === 'ascending' ? 1 : -1
    return [...rows].sort((a, b) => {
      const x = column.value(a)
      const y = column.value(b)
      return (typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y))) * factor
    })
  }, [rows, columns, sort])

  const toggle = (key: string, numeric?: boolean) =>
    setSort((current) =>
      current.key === key
        ? { key, direction: current.direction === 'ascending' ? 'descending' : 'ascending' }
        : { key, direction: numeric ? 'descending' : 'ascending' },
    )

  return (
    <div className="-mx-5 overflow-x-auto px-5">
      <table className="w-full min-w-[32rem] border-collapse text-sm">
        <caption className="sr-only">{caption}. Select a column heading to sort.</caption>
        <thead>
          <tr className="border-b border-border">
            {columns.map((column) => {
              const active = sort.key === column.key
              return (
                <th
                  key={column.key}
                  scope="col"
                  aria-sort={active ? sort.direction : 'none'}
                  className={`py-2 pr-4 font-semibold text-ink-muted last:pr-0 ${column.numeric ? 'text-right' : 'text-left'}`}
                >
                  <button
                    type="button"
                    onClick={() => toggle(column.key, column.numeric)}
                    className={`inline-flex items-center gap-1 rounded hover:text-ink ${active ? 'text-ink' : ''}`}
                  >
                    {column.header}
                    <span aria-hidden="true" className="text-xs">
                      {active ? (sort.direction === 'ascending' ? '▲' : '▼') : '↕'}
                    </span>
                  </button>
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row) => (
            <tr key={rowKey(row)} className="border-b border-border last:border-0 hover:bg-surface-muted/60">
              {columns.map((column) => (
                <td
                  key={column.key}
                  className={`py-2.5 pr-4 text-ink last:pr-0 ${column.numeric ? 'num text-right' : 'text-left'}`}
                >
                  {column.render ? column.render(row) : column.value(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
