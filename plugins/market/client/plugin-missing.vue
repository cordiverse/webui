<template>
  <k-comment type="primary">
    <p>此插件尚未安装, <a class="install-link" @click="onClick">点击安装</a>。</p>
  </k-comment>
</template>

<script lang="ts" setup>

import { activePackage } from './store'

const props = defineProps<{ name: string }>()

function onClick() {
  activePackage.value = { name: props.name, bulkModeEnabled: false }
}

</script>

<style lang="scss" scoped>

.install-link {
  color: var(--accent);
  cursor: pointer;
}

</style>
