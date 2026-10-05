import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import {
  columnFilteringFeature,
  columnVisibilityFeature,
  createColumnHelper,
  createFilteredRowModel,
  createPaginatedRowModel,
  createSortedRowModel,
  filterFn_includesString,
  globalFilteringFeature,
  rowPaginationFeature,
  rowSortingFeature,
  tableFeatures,
  useTable,
  type RowData,
} from '@tanstack/react-table'
import { ArrowDown, ArrowUp, ArrowUpDown, Columns3, Search } from 'lucide-react'
import { Button } from '@/shared/ui/button'
import { normalizeLogSearchText } from '@/features/logs/domain/logTableSearch'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu'
import { Input } from '@/shared/ui/input'
import { NativeSelect } from '@/shared/ui/native-select'
import {
  Table as DataTable,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/shared/ui/table'

export type LogTableColumn<TData extends RowData> = {
  id: string
  label: string
  value: (entry: TData) => string | number
  cell: (entry: TData) => ReactNode
  align?: 'left' | 'right'
  hideable?: boolean
  sortable?: boolean
  sortDescFirst?: boolean
}

type ResponsiveLogTableProps<TData extends RowData> = {
  columns: LogTableColumn<TData>[]
  data: TData[]
  emptyTitle: string
  getRowId: (entry: TData) => string
  initialSortId: string
  mobileCard: (entry: TData) => ReactNode
  noun: string
  pageSize?: number
  searchPlaceholder: string
  searchText: (entry: TData) => string
  hasMore?: boolean
  onLoadMore?: () => void
  showFooter?: boolean
  showToolbar?: boolean
}

const logTableFeatures = tableFeatures({
  columnFilteringFeature,
  globalFilteringFeature,
  filteredRowModel: createFilteredRowModel(),
  filterFns: { includesString: filterFn_includesString },
  columnVisibilityFeature,
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
  rowPaginationFeature,
  paginatedRowModel: createPaginatedRowModel(),
})

function SortIcon({ direction }: { direction: false | 'asc' | 'desc' }) {
  if (direction === 'asc') return <ArrowUp className="h-3.5 w-3.5 text-cyan-700" />
  if (direction === 'desc') return <ArrowDown className="h-3.5 w-3.5 text-cyan-700" />
  return <ArrowUpDown className="h-3.5 w-3.5" />
}

export function ResponsiveLogTable<TData extends RowData>({
  columns,
  data,
  emptyTitle,
  getRowId,
  hasMore = false,
  initialSortId,
  mobileCard,
  noun,
  onLoadMore,
  pageSize = 10,
  searchPlaceholder,
  searchText,
  showFooter = true,
  showToolbar = true,
}: ResponsiveLogTableProps<TData>) {
  const [searchInput, setSearchInput] = useState('')
  const columnHelper = useMemo(() => createColumnHelper<typeof logTableFeatures, TData>(), [])
  const tableColumns = useMemo(() => columnHelper.columns([
    ...columns.map((definition) => columnHelper.accessor(definition.value, {
      id: definition.id,
      header: ({ column }) => definition.sortable === false ? definition.label : (
        <button className="inline-flex items-center gap-1.5" type="button" onClick={() => column.toggleSorting()}>
          {definition.label} <SortIcon direction={column.getIsSorted()} />
        </button>
      ),
      cell: ({ row }) => definition.cell(row.original),
      enableGlobalFilter: false,
      enableHiding: definition.hideable !== false,
      enableSorting: definition.sortable !== false,
      sortDescFirst: definition.sortDescFirst,
    })),
    columnHelper.accessor((entry) => normalizeLogSearchText(searchText(entry)), {
      id: '_search',
      header: 'Search',
      cell: () => null,
      enableGlobalFilter: true,
      enableHiding: false,
      enableSorting: false,
    }),
  ]), [columnHelper, columns, searchText])

  const table = useTable({
    features: logTableFeatures,
    columns: tableColumns,
    data,
    getRowId,
    getColumnCanGlobalFilter: (column) => column.id === '_search',
    globalFilterFn: 'includesString',
    initialState: {
      columnVisibility: { _search: false },
      pagination: { pageIndex: 0, pageSize },
      sorting: [{ id: initialSortId, desc: true }],
    },
    enableSortingRemoval: false,
  })

  const filteredCount = table.getPrePaginatedRowModel().rows.length
  const pageRows = table.getRowModel().rows
  const pageCount = Math.max(table.getPageCount(), 1)

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      {showToolbar ? <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            value={searchInput}
            placeholder={searchPlaceholder}
            aria-label={searchPlaceholder}
            onChange={(event) => {
              setSearchInput(event.target.value)
              table.setGlobalFilter(normalizeLogSearchText(event.target.value))
              table.setPageIndex(0)
            }}
          />
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="outline" className="self-start sm:self-auto">
              <Columns3 className="h-4 w-4" /> Columns
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Visible columns</DropdownMenuLabel>
            {table.getAllLeafColumns().filter((column) => column.getCanHide()).map((column) => (
              <DropdownMenuCheckboxItem
                key={column.id}
                checked={column.getIsVisible()}
                onCheckedChange={(checked) => column.toggleVisibility(Boolean(checked))}
              >
                {columns.find((definition) => definition.id === column.id)?.label ?? column.id}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div> : null}

      {filteredCount === 0 ? (
        <div className="grid min-h-24 place-items-center rounded-2xl border border-dashed border-border/80 bg-secondary/20 px-4 text-center">
          <div>
            <p className="text-sm font-semibold text-foreground">{emptyTitle}</p>
          </div>
        </div>
      ) : (
        <>
          <div className="hidden min-h-0 flex-1 overflow-auto rounded-2xl border border-border/70 bg-background/35 md:block">
            <DataTable>
              <TableHeader className="bg-secondary/40">
                {table.getHeaderGroups().map((headerGroup) => (
                  <TableRow key={headerGroup.id}>
                    {headerGroup.headers.map((header) => (
                      <TableHead key={header.id} className={columns.find((definition) => definition.id === header.column.id)?.align === 'right' ? 'text-right' : undefined}>
                        {header.isPlaceholder ? null : <table.FlexRender header={header} />}
                      </TableHead>
                    ))}
                  </TableRow>
                ))}
              </TableHeader>
              <TableBody>
                {pageRows.map((row) => (
                  <TableRow key={row.id}>
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id} className={columns.find((definition) => definition.id === cell.column.id)?.align === 'right' ? 'text-right' : undefined}>
                        <table.FlexRender cell={cell} />
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </DataTable>
          </div>

          <div className="grid gap-2 md:hidden">
            {pageRows.map((row) => <div key={row.id}>{mobileCard(row.original)}</div>)}
          </div>
        </>
      )}

      {showFooter ? <div className="flex flex-col gap-2 border-t border-border/60 pt-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-muted-foreground">
          {filteredCount} {noun}{filteredCount === 1 ? '' : 's'} | Page {table.state.pagination.pageIndex + 1} of {pageCount}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {hasMore && onLoadMore ? <Button type="button" variant="outline" size="sm" onClick={onLoadMore}>Load more records</Button> : null}
          <div className="w-28">
            <NativeSelect value={String(table.state.pagination.pageSize)} aria-label={`${noun}s per page`} onChange={(event) => table.setPageSize(Number(event.target.value))}>
              <option value="10">10 per page</option>
              <option value="25">25 per page</option>
              <option value="50">50 per page</option>
            </NativeSelect>
          </div>
          <Button type="button" variant="outline" size="sm" disabled={!table.getCanPreviousPage()} onClick={() => table.previousPage()}>Previous</Button>
          <Button type="button" variant="outline" size="sm" disabled={!table.getCanNextPage()} onClick={() => table.nextPage()}>Next</Button>
        </div>
      </div> : null}
    </div>
  )
}
