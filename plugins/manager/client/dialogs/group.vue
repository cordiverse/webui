<template>
  <el-dialog
    :model-value="createGroup !== undefined"
    @update:model-value="createGroup = undefined"
    title="创建分组"
    destroy-on-close
    @open="handleOpen"
  >
    <el-input ref="inputEl" v-model="input" @keydown.enter.stop.prevent="action"/>
    <template #footer>
      <el-button @click="createGroup = undefined">取消</el-button>
      <el-button type="primary" @click="action">确定</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">

import { ref, computed, watch } from 'vue'
import { send, useContext, router } from '@cordisjs/client'
import { useAutoFocus } from '../utils'

const input = ref('')
const inputEl = ref()

const show = ref(false)
const ctx = useContext()

const handleOpen = useAutoFocus(inputEl)

const createGroup = computed(() => ctx.manager.dialogCreateGroup)

watch(createGroup, (value) => {
  if (!value) return
  show.value = true
})

async function action() {
  const id = await send('manager.config.create', {
    name: 'cordis/group',
    parent: createGroup.value!.id,
    label: input.value || undefined,
  })
  router.replace('/plugins/' + id)
  ctx.manager.dialogCreateGroup = undefined
}

</script>
