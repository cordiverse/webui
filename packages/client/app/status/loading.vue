<template>
  <k-status v-if="!socket">
    <span class="offline">连接已断开</span>
  </k-status>
  <k-status v-else-if="progress < 1">
    <el-progress :indeterminate="!ctx.client.loader.version" :percentage="progress * 100">
      正在加载页面组件
    </el-progress>
  </k-status>
</template>

<script lang="ts" setup>

import { useContext, socket } from '@cordisjs/client'
import { computed } from 'vue'

const ctx = useContext()

const progress = computed(() => {
  const states = Object.values(ctx.client.loader.entries)
  return states.filter(state => state.done.value).length / states.length
})

</script>

<style lang="scss" scoped>
.offline {
  color: var(--error, #e74c3c);
  font-weight: 500;
}
</style>
