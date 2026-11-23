export interface TableColumn {
  label: string
  align: 'left' | 'center' | 'right'
  /** Fixed width in pixels. At most one column of a table omits it. */
  width?: number
  /** Maximum width in pixels of the column that omits `width`. */
  maxWidth?: number
}
