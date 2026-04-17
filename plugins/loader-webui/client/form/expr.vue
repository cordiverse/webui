<template>
  <schema-base>
    <template #title><slot name="title"></slot></template>
    <template #desc><slot name="desc"></slot></template>
    <template #menu><slot name="menu"></slot></template>
    <template #prefix><slot name="prefix"></slot></template>
    <template #suffix><slot name="suffix"></slot></template>
    <template #control>
      <el-button
        v-if="!result.error"
        @click="config = result.value"
        :disabled="disabled"
      >转换为计算值</el-button>
    </template>
    <div class="bottom">
      <el-input
        type="textarea"
        v-model="config.__jsExpr"
        :disabled="disabled"
        :class="{ invalid: result.error }"
        autosize
      ></el-input>
      <p class="mt-2 invalid" v-if="result.error === 'syntax'">语法错误</p>
      <p class="mt-2 invalid" v-else-if="result.error === 'evaluation'">运行错误</p>
      <p class="mt-2 invalid" v-else-if="result.error === 'validation'">非法值</p>
      <p class="mt-2 invalid" v-else-if="result.error === 'timeout'">计算超时</p>
      <p class="mt-2" v-else-if="result.value">计算结果：{{ result.value }}</p>
    </div>
  </schema-base>
</template>

<script lang="ts" setup>

import { PropType, ref, computed } from 'vue'
import { Schema, SchemaBase, useContext, send } from '@cordisjs/client'
import { watchDebounced } from '@vueuse/core'
import { EvalResult } from '../../src'

const props = defineProps({
  schema: {} as PropType<Schema>,
  modelValue: {} as PropType<any[]>,
  disabled: {} as PropType<boolean>,
  prefix: {} as PropType<string>,
  initial: {} as PropType<{}>,
})

const emit = defineEmits(['update:modelValue'])

const ctx = useContext()
const config = SchemaBase.useModel()
const result = ref<EvalResult>({})

const currentEntry = computed(() => ctx.manager.currentEntry!)

watchDebounced(() => props.modelValue.__jsExpr, async (expr) => {
  if (!expr) return result.value = {}
  result.value = await send('manager.config.eval', {
    id: currentEntry.value.id,
    expr,
    schema: props.schema,
  })
}, { debounce: 100, maxWait: 500 })

</script>

<style lang="scss" scoped>

.invalid {
  color: var(--el-color-danger);
}

</style>
