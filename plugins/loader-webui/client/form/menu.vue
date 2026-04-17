<template>
  <div
    class="k-menu-item"
    :class="{ disabled: disabled || isExpr }"
    @click="convertToExpr">
    <span class="k-menu-icon"><icon-code></icon-code></span>
    转换为表达式
  </div>
</template>

<script lang="ts" setup>

import { computed, ref, watch } from 'vue'
import { SchemaBase, Schema, IconCode, send } from '@cordisjs/client'

defineOptions({
  inheritAttrs: false,
})

const props = defineProps({
  schema: {} as PropType<Schema>,
  initial: {} as PropType<any>,
  modelValue: {} as PropType<any>,
  disabled: Boolean,
})

const emit = defineEmits(['update:modelValue'])

const jsonInput = computed(() => {
  return JSON.stringify(props.modelValue ?? SchemaBase.getFallback(props.schema), null, 2)
})

const isExpr = computed(() => {
  return props.modelValue instanceof Object && '__jsExpr' in props.modelValue
})

function convertToExpr() {
  emit('update:modelValue', { __jsExpr: jsonInput.value })
}

</script>
