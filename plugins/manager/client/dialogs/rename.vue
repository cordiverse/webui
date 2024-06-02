<template>
  <el-dialog
    v-model="show"
    title="重命名"
    destroy-on-close
    @open="handleOpen"
    @closed="ctx.manager.dialogRename = undefined"
  >
    <el-input ref="inputEl" v-model="input" @keydown.enter.stop.prevent="renameItem"/>
    <template #footer>
      <el-button @click="show = false">取消</el-button>
      <el-button type="primary" @click="renameItem">确定</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">

import { ref, computed, watch } from 'vue'
import { send, useContext } from '@cordisjs/client'
import { useAutoFocus } from '../utils'

const input = ref('')
const inputEl = ref()
const show = ref(false)
const ctx = useContext()

const handleOpen = useAutoFocus(inputEl)

const rename = computed(() => ctx.manager.dialogRename)

function getDefault() {
  if (!rename.value) return ''
  return rename.value.name === 'group' ? rename.value.id : rename.value.name
}

watch(rename, (value) => {
  if (!value) return
  show.value = true
  input.value = value.label || getDefault()
})

async function renameItem() {
  show.value = false
  const label = !input.value || input.value === getDefault() ? null : input.value
  ctx.manager.dialogRename!.label = label
  await send('manager.config.update', {
    id: ctx.manager.dialogRename!.id,
    label,
  })
}

</script>
