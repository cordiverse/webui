<template>
  <colgroup>
    <col/>
    <col v-for="(column, index) of columns" :key="index" :style="{ width: getWidth(column) }"/>
    <col/>
  </colgroup>
</template>

<script lang="ts" setup>

import { computed } from 'vue'
import type { TableColumn } from './table'

const props = defineProps<{
  columns: TableColumn[]
}>()

const fixedWidth = computed(() => {
  return props.columns.reduce((total, column) => total + (column.width ?? 0), 0)
})

// The column without a fixed width takes the remaining width of the container
// (`.k-table-head` or `.k-table-body`), up to its maximum width. Two filler
// columns without a width share the rest equally, so that the columns are
// centered; every row therefore begins and ends with a filler cell.
function getWidth(column: TableColumn) {
  if (column.width !== undefined) return column.width + 'px'
  const remaining = `100cqw - ${fixedWidth.value}px`
  if (column.maxWidth === undefined) return `max(0px, ${remaining})`
  return `clamp(0px, ${remaining}, ${column.maxWidth}px)`
}

</script>
