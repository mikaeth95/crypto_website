import {
  type Row,
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { useState } from "react";
import { Input } from "./input";
import { cn } from "../../lib/utils";

export const DataTable = <T extends object>({
  columns,
  data,
  searchPlaceholder = "Search...",
  className,
  tableContainerClassName,
  tableClassName,
  headerCellClassName,
  bodyCellClassName,
  onRowClick,
  rowClassName,
}: {
  columns: ColumnDef<T>[];
  data: T[];
  searchPlaceholder?: string;
  className?: string;
  tableContainerClassName?: string;
  tableClassName?: string;
  headerCellClassName?: string;
  bodyCellClassName?: string;
  onRowClick?: (row: T) => void;
  rowClassName?: (row: Row<T>) => string;
}) => {
  const [globalFilter, setGlobalFilter] = useState("");
  const table = useReactTable({
    data,
    columns,
    state: { globalFilter },
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  return (
    <div className={cn("space-y-3", className)}>
      <Input
        value={globalFilter}
        onChange={(event) => setGlobalFilter(event.target.value)}
        placeholder={searchPlaceholder}
        className="max-w-sm"
      />

      <div
        className={cn(
          "overflow-x-auto rounded-[18px] border border-border/90 bg-panel shadow-[0_14px_34px_rgba(0,0,0,0.28)]",
          tableContainerClassName,
        )}
      >
        <table className={cn("min-w-full text-sm", tableClassName)}>
          <thead className="sticky top-0 z-10 border-b border-border/80 bg-[#121821] text-left text-[10px] uppercase tracking-[0.18em] text-slate-500">
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <th
                    key={header.id}
                    className={cn("select-none px-4 py-3.5 font-semibold caret-transparent", headerCellClassName)}
                    onClick={header.column.getToggleSortingHandler()}
                  >
                    <div
                      className={cn(
                        "inline-flex items-center gap-1.5 transition",
                        header.column.getCanSort() ? "cursor-pointer hover:text-slate-100" : "",
                      )}
                    >
                      {flexRender(header.column.columnDef.header, header.getContext())}
                      {header.column.getCanSort() ? (
                        <span className="text-[10px] text-slate-500">
                          {header.column.getIsSorted() === "asc"
                            ? "\u25B2"
                            : header.column.getIsSorted() === "desc"
                              ? "\u25BC"
                              : "\u2022"}
                        </span>
                      ) : null}
                    </div>
                  </th>
                ))}
              </tr>
            ))}
          </thead>

          <tbody>
            {table.getRowModel().rows.map((row, index) => (
              <tr
                key={row.id}
                onClick={onRowClick ? () => onRowClick(row.original) : undefined}
                className={cn(
                  "border-t border-border/70 transition",
                  index % 2 === 0 ? "bg-panelSoft/35" : "bg-transparent",
                  onRowClick
                    ? "cursor-pointer select-none caret-transparent hover:bg-[#151c25] focus-within:bg-[#151c25]"
                    : "hover:bg-[#131922]",
                  rowClassName?.(row),
                )}
              >
                {row.getVisibleCells().map((cell) => (
                  <td
                    key={cell.id}
                    className={cn("px-4 py-3 text-slate-100 select-none caret-transparent", bodyCellClassName)}
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>

        {!table.getRowModel().rows.length ? (
          <div className="px-4 py-10 text-center text-sm text-slate-400">No matching records.</div>
        ) : null}
      </div>
    </div>
  );
};
