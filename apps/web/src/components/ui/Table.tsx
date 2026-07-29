import React from 'react'
import { cn } from '../../utils/cn'

export const Table = React.forwardRef<
  HTMLTableElement,
  React.HTMLAttributes<HTMLTableElement>
>(({ className, ...props }, ref) => (
  <div className="relative w-full overflow-x-auto rounded-lg border border-border/80 bg-card">
    <table
      ref={ref}
      className={cn('w-full caption-bottom text-sm text-foreground', className)}
      {...props}
    />
  </div>
))
Table.displayName = 'Table'

export const TableHeader = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <thead
    ref={ref}
    className={cn('bg-muted/50 border-b border-border text-xs font-semibold uppercase tracking-wider text-muted-foreground', className)}
    {...props}
  />
))
TableHeader.displayName = 'TableHeader'

export const TableBody = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <tbody
    ref={ref}
    className={cn('[&_tr:last-child]:border-0 divide-y divide-border/40', className)}
    {...props}
  />
))
TableBody.displayName = 'TableBody'

export const TableFooter = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <tfoot
    ref={ref}
    className={cn('border-t border-border bg-muted/50 font-medium text-foreground', className)}
    {...props}
  />
))
TableFooter.displayName = 'TableFooter'

export const TableRow = React.forwardRef<
  HTMLTableRowElement,
  React.HTMLAttributes<HTMLTableRowElement>
>(({ className, ...props }, ref) => (
  <tr
    ref={ref}
    className={cn(
      'transition-colors hover:bg-muted/40 data-[state=selected]:bg-muted',
      className,
    )}
    {...props}
  />
))
TableRow.displayName = 'TableRow'

export const TableHead = React.forwardRef<
  HTMLTableCellElement,
  React.ThHTMLAttributes<HTMLTableCellElement>
>(({ className, ...props }, ref) => (
  <th
    ref={ref}
    className={cn(
      'h-10 px-4 text-left align-middle font-medium text-muted-foreground [&:has([role=checkbox])]:pr-0',
      className,
    )}
    {...props}
  />
))
TableHead.displayName = 'TableHead'

export const TableCell = React.forwardRef<
  HTMLTableCellElement,
  React.TdHTMLAttributes<HTMLTableCellElement>
>(({ className, ...props }, ref) => (
  <td
    ref={ref}
    className={cn('p-3.5 px-4 align-middle whitespace-nowrap [&:has([role=checkbox])]:pr-0', className)}
    {...props}
  />
))
TableCell.displayName = 'TableCell'

export const TableCaption = React.forwardRef<
  HTMLTableCaptionElement,
  React.HTMLAttributes<HTMLTableCaptionElement>
>(({ className, ...props }, ref) => (
  <caption
    ref={ref}
    className={cn('mt-4 text-xs text-muted-foreground', className)}
    {...props}
  />
))
TableCaption.displayName = 'TableCaption'
