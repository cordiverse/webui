<template>
  <span class="type-icon" :class="`type-${category}`" :title="type">{{ glyph }}</span>
</template>

<script lang="ts" setup>

import { computed } from 'vue'

const props = defineProps<{
  type: string
}>()

interface TypeMeta {
  category: string
  glyph: string
}

function classify(type: string): TypeMeta {
  switch (type) {
    case 'integer':
    case 'unsigned':
      return { category: 'int', glyph: '#' }
    case 'float':
    case 'double':
    case 'decimal':
      return { category: 'float', glyph: '½' }
    case 'bigint':
      return { category: 'int', glyph: 'N' }
    case 'char':
    case 'string':
      return { category: 'string', glyph: 'a' }
    case 'text':
      return { category: 'string', glyph: '¶' }
    case 'boolean':
      return { category: 'bool', glyph: '✓' }
    case 'date':
      return { category: 'date', glyph: 'D' }
    case 'time':
      return { category: 'date', glyph: 'T' }
    case 'timestamp':
      return { category: 'date', glyph: '⏱' }
    case 'json':
      return { category: 'json', glyph: '{}' }
    case 'list':
      return { category: 'list', glyph: '[]' }
    case 'binary':
      return { category: 'binary', glyph: 'B' }
    case 'primary':
      return { category: 'primary', glyph: '⚷' }
    case 'expr':
      return { category: 'expr', glyph: 'ƒ' }
    default:
      return { category: 'unknown', glyph: '?' }
  }
}

const meta = computed(() => classify(props.type))
const category = computed(() => meta.value.category)
const glyph = computed(() => meta.value.glyph)

</script>

<style lang="scss" scoped>

.type-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  border-radius: var(--radius-sm);
  font-family: var(--font-mono);
  font-size: 10px;
  font-weight: 600;
  flex-shrink: 0;
  user-select: none;

  &.type-int    { background: var(--accent-muted);  color: var(--accent); }
  &.type-float  { background: var(--accent-muted);  color: var(--accent); }
  &.type-string { background: var(--success-muted); color: var(--success); }
  &.type-bool   { background: var(--success-muted); color: var(--success); }
  &.type-date   { background: var(--warning-muted); color: var(--warning); }
  &.type-json   { background: var(--warning-muted); color: var(--warning); font-size: 9px; }
  &.type-list   { background: var(--warning-muted); color: var(--warning); font-size: 9px; }
  &.type-binary { background: var(--bg-hover);      color: var(--text-secondary); }
  &.type-primary { background: var(--error-muted);  color: var(--error); }
  &.type-expr   { background: var(--bg-hover);      color: var(--text-secondary); font-style: italic; }
  &.type-unknown { background: var(--bg-hover);     color: var(--text-tertiary); }
}

</style>
