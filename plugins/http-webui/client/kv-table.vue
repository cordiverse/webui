<template>
  <div class="panel-content kv-table">
    <div v-for="(row, index) of rows" :key="index" class="kv-row">
      <input
        type="checkbox"
        class="kv-checkbox"
        :class="{ invisible: isTrailing(index) }"
        v-model="row.enabled"
      />
      <input
        class="kv-input kv-key"
        v-model="row.key"
        :placeholder="keyPlaceholder"
        @input="ensureTrailing"
      />
      <input
        class="kv-input"
        v-model="row.value"
        :placeholder="valuePlaceholder"
        @input="ensureTrailing"
      />
      <button
        class="btn-icon-sm"
        :class="{ invisible: isTrailing(index) }"
        @click="removeRow(index)"
      >
        <k-icon name="trash"/>
      </button>
    </div>
  </div>
</template>

<script lang="ts" setup>

export interface KvRow {
  enabled: boolean
  key: string
  value: string
}

const props = defineProps<{
  rows: KvRow[]
  keyPlaceholder?: string
  valuePlaceholder?: string
}>()

function isTrailing(index: number) {
  return index === props.rows.length - 1 && !props.rows[index].key && !props.rows[index].value
}

function ensureTrailing() {
  const last = props.rows[props.rows.length - 1]
  if (!last || last.key || last.value) {
    props.rows.push({ enabled: true, key: '', value: '' })
  }
}

function removeRow(index: number) {
  props.rows.splice(index, 1)
  ensureTrailing()
}

</script>

<style lang="scss" scoped>

.kv-table {
  flex: 1 1 0;
  min-height: 0;
  overflow-y: auto;
  padding: 12px 16px;
  font-family: var(--font-mono);
  font-size: 12px;
  line-height: 1.7;
  color: var(--text-primary);
}

.kv-row {
  display: flex;
  gap: 8px;
  margin-bottom: 6px;
  align-items: center;
}

.kv-input {
  flex: 1;
  height: 28px;
  background: var(--bg-tertiary);
  border: 1px solid var(--border-primary);
  border-radius: var(--radius-sm);
  padding: 0 8px;
  font-size: 12px;
  font-family: var(--font-mono);
  color: var(--text-primary);
  outline: none;
  min-width: 0;

  &:focus {
    border-color: var(--border-focus);
  }
}

.kv-key {
  flex: 0 0 180px;
}

.kv-checkbox {
  width: 14px;
  height: 14px;
  accent-color: var(--accent);
  flex-shrink: 0;

  &.invisible {
    visibility: hidden;
  }
}

.btn-icon-sm {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: 1px solid var(--border-primary);
  border-radius: var(--radius-sm);
  color: var(--text-tertiary);
  cursor: pointer;
  flex-shrink: 0;

  &:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
  }

  &.invisible {
    visibility: hidden;
  }

  :deep(.k-icon) {
    width: 14px;
    height: 14px;
  }
}

</style>
