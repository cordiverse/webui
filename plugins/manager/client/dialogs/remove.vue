<template>
  <el-dialog
    v-model="show"
    title="确认移除"
    destroy-on-close
    @closed="remove = undefined"
  >
    <template v-if="remove">
      确定要移除{{ remove.isGroup ? `分组 ${remove.label || remove.id}` : `插件 ${remove.label || remove.name}` }} 吗？此操作不可撤销！
    </template>
    <template #footer>
      <el-button @click="show = false">取消</el-button>
      <el-button type="danger" @click="removeItem">确定</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">

import { ref, computed, watch } from 'vue'
import { useContext } from '@cordisjs/client'

const show = ref(false)
const ctx = useContext()

const remove = computed(() => ctx.manager.dialogRemove)

watch(remove, (value) => {
  if (!value) return
  show.value = true
})

async function removeItem() {
  show.value = false
  ctx.manager.remove(remove!)
  // tree?.activate()
}

</script>
