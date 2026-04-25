<template>
  <el-dialog v-model="visible" :title="title" destroy-on-close width="480px" @closed="onClosed">
    <div v-if="ctx" class="edit-body">
      <div class="edit-meta">
        <field-type :type="ctx.field.type"/>
        <span class="meta-name">{{ ctx.field.name }}</span>
        <span class="meta-type">{{ ctx.field.type }}{{ ctx.field.nullable ? ' · nullable' : '' }}</span>
      </div>

      <div v-if="readonly" class="readonly-note">
        {{ readonlyReason }}
      </div>

      <div class="edit-input">
        <template v-if="kind === 'bool'">
          <el-radio-group v-model="boolValue" :disabled="readonly">
            <el-radio :value="'true'">true</el-radio>
            <el-radio :value="'false'">false</el-radio>
            <el-radio v-if="ctx.field.nullable" :value="'null'">null</el-radio>
          </el-radio-group>
        </template>
        <template v-else-if="kind === 'json'">
          <el-input
            v-model="textValue"
            type="textarea"
            :rows="6"
            placeholder="JSON"
            :disabled="readonly || isNull"
          />
          <label v-if="ctx.field.nullable" class="null-toggle">
            <input type="checkbox" v-model="isNull" :disabled="readonly"/>
            设为 null
          </label>
        </template>
        <template v-else>
          <el-input
            v-model="textValue"
            :placeholder="placeholder"
            :disabled="readonly || isNull"
            @keyup.enter="dirty && !saving && onConfirm()"
          />
          <label v-if="ctx.field.nullable" class="null-toggle">
            <input type="checkbox" v-model="isNull" :disabled="readonly"/>
            设为 null
          </label>
        </template>
      </div>

      <div v-if="error" class="edit-error">{{ error }}</div>
    </div>

    <template #footer>
      <el-button @click="visible = false">取消</el-button>
      <el-button
        type="primary"
        :disabled="readonly || !dirty || saving"
        :loading="saving"
        @click="onConfirm"
      >
        {{ confirmLabel }}
      </el-button>
    </template>
  </el-dialog>
</template>

<script lang="ts" setup>

import { computed, ref, watch } from 'vue'
import { send } from '@cordisjs/client'
import { deepEqual } from 'cosmokit'
import FieldType from './field-type.vue'
import type { FieldInfo } from '../src'
import { invalidateTable } from './state'

export interface EditContext {
  table: string
  primary: string[]
  field: FieldInfo
  row: Record<string, any>
}

const props = defineProps<{
  modelValue: boolean
  ctx?: EditContext
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
  (e: 'saved'): void
}>()

const visible = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v),
})

type Kind = 'string' | 'number' | 'bigint' | 'bool' | 'date' | 'json' | 'binary' | 'expr' | 'unknown'

const NUMERIC = new Set(['integer', 'unsigned', 'float', 'double', 'decimal'])
const STRING = new Set(['char', 'string', 'text'])
const DATE = new Set(['date', 'time', 'timestamp'])
const JSONISH = new Set(['json', 'list'])

function kindOf(type: string): Kind {
  if (NUMERIC.has(type)) return 'number'
  if (STRING.has(type)) return 'string'
  if (type === 'bigint') return 'bigint'
  if (type === 'boolean') return 'bool'
  if (DATE.has(type)) return 'date'
  if (JSONISH.has(type)) return 'json'
  if (type === 'binary') return 'binary'
  if (type === 'expr') return 'expr'
  return 'unknown'
}

const kind = computed<Kind>(() => kindOf(props.ctx?.field.type ?? ''))

const readonly = computed(() => {
  if (!props.ctx) return true
  if (props.ctx.field.primary) return true
  if (kind.value === 'expr' || kind.value === 'binary') return true
  return false
})

const readonlyReason = computed(() => {
  if (!props.ctx) return ''
  if (props.ctx.field.primary) return '主键字段不可修改。'
  if (kind.value === 'expr') return '计算字段不可修改。'
  if (kind.value === 'binary') return '二进制字段暂不支持在此编辑。'
  return ''
})

const title = computed(() => {
  if (!props.ctx) return '编辑'
  return `编辑 ${props.ctx.table}.${props.ctx.field.name}`
})

const placeholder = computed(() => {
  switch (kind.value) {
    case 'number': return '数字'
    case 'bigint': return '大整数'
    case 'date': return 'ISO 字符串 (e.g. 2024-01-01T00:00:00Z)'
    default: return ''
  }
})

const textValue = ref('')
const boolValue = ref<'true' | 'false' | 'null'>('false')
const isNull = ref(false)
const saving = ref(false)
const error = ref('')

watch(() => [props.modelValue, props.ctx], () => {
  if (!props.modelValue || !props.ctx) return
  error.value = ''
  saving.value = false
  const raw = props.ctx.row[props.ctx.field.name]
  isNull.value = raw === null
  if (kind.value === 'bool') {
    boolValue.value = raw === null ? 'null' : raw ? 'true' : 'false'
  } else if (kind.value === 'json') {
    textValue.value = raw === null || raw === undefined ? '' : JSON.stringify(raw, null, 2)
  } else if (raw instanceof Date) {
    textValue.value = raw.toISOString()
  } else if (raw === null || raw === undefined) {
    textValue.value = ''
  } else {
    textValue.value = String(raw)
  }
}, { immediate: true })

function onClosed() {
  textValue.value = ''
  error.value = ''
  saving.value = false
}

interface ParseResult {
  ok: boolean
  value?: any
  error?: string
}

function parseValue(): ParseResult {
  if (!props.ctx) return { ok: false, error: 'no context' }
  if (kind.value === 'bool') {
    if (boolValue.value === 'null') return { ok: true, value: null }
    return { ok: true, value: boolValue.value === 'true' }
  }
  if (isNull.value) return { ok: true, value: null }
  const raw = textValue.value
  switch (kind.value) {
    case 'number': {
      if (raw.trim() === '') {
        if (props.ctx.field.nullable) return { ok: true, value: null }
        return { ok: false, error: '不能为空' }
      }
      const n = Number(raw)
      if (!Number.isFinite(n)) return { ok: false, error: '不是合法数字' }
      return { ok: true, value: n }
    }
    case 'bigint': {
      try {
        return { ok: true, value: BigInt(raw) as any }
      } catch {
        return { ok: false, error: '不是合法整数' }
      }
    }
    case 'date': {
      const d = new Date(raw)
      if (isNaN(d.getTime())) return { ok: false, error: '不是合法日期' }
      return { ok: true, value: d }
    }
    case 'json': {
      if (raw.trim() === '') {
        if (props.ctx.field.nullable) return { ok: true, value: null }
        return { ok: false, error: '不能为空' }
      }
      try {
        return { ok: true, value: JSON.parse(raw) }
      } catch (e: any) {
        return { ok: false, error: 'JSON 解析失败: ' + e.message }
      }
    }
    default:
      return { ok: true, value: raw }
  }
}

const parsed = computed<ParseResult>(() => {
  // depend on inputs to keep reactivity
  void textValue.value
  void boolValue.value
  void isNull.value
  return parseValue()
})

const dirty = computed(() => {
  if (!props.ctx) return false
  if (!parsed.value.ok) return false
  const original = props.ctx.row[props.ctx.field.name]
  return !equalValue(original, parsed.value.value)
})

function equalValue(a: any, b: any): boolean {
  if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime()
  if (a instanceof Date || b instanceof Date) return false
  return deepEqual(a, b)
}

const confirmLabel = computed(() => {
  if (saving.value) return '保存中…'
  if (!parsed.value.ok) return '确认'
  return dirty.value ? '修改' : '无修改'
})

async function onConfirm() {
  if (!props.ctx || readonly.value || saving.value) return
  if (!parsed.value.ok) {
    error.value = parsed.value.error ?? '输入无效'
    return
  }
  if (!dirty.value) return
  const where: Record<string, unknown> = {}
  for (const k of props.ctx.primary) {
    where[k] = props.ctx.row[k]
  }
  saving.value = true
  error.value = ''
  try {
    await send('database-webui.update', {
      table: props.ctx.table,
      where,
      field: props.ctx.field.name,
      value: parsed.value.value,
    })
    invalidateTable(props.ctx.table)
    emit('saved')
    visible.value = false
  } catch (e: any) {
    error.value = String(e?.message ?? e)
  } finally {
    saving.value = false
  }
}

</script>

<style lang="scss" scoped>

.edit-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.edit-meta {
  display: flex;
  align-items: center;
  gap: 8px;
}

.meta-name {
  font-family: var(--font-mono);
  font-weight: 600;
  font-size: 13px;
}

.meta-type {
  font-size: 11px;
  color: var(--text-tertiary);
}

.readonly-note {
  padding: 6px 10px;
  border-radius: var(--radius-sm);
  background: var(--warning-muted);
  color: var(--warning);
  font-size: 12px;
}

.edit-input {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.null-toggle {
  font-size: 12px;
  color: var(--text-tertiary);
  display: inline-flex;
  align-items: center;
  gap: 4px;
  cursor: pointer;
}

.edit-error {
  padding: 6px 10px;
  border-radius: var(--radius-sm);
  background: var(--error-muted);
  color: var(--error);
  font-size: 12px;
}

</style>
