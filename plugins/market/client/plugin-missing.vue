<template>
  <k-comment type="primary">
    <p v-if="inMarket">
      此插件尚未安装, <a class="install-link" @click="onInstall">点击安装</a>。
    </p>
    <p v-else>
      此插件尚未安装, <a class="install-link" @click="onSearch">前往插件市场搜索</a>。
    </p>
  </k-comment>
</template>

<script lang="ts" setup>

import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useRpc } from '@cordisjs/client'
import type { Data } from '../src'
import { activePackage } from './store'

const props = defineProps<{ name: string }>()

const router = useRouter()
const data = useRpc<Data>()

const inMarket = computed(() => !!data.value?.market?.data?.[props.name])

function onInstall() {
  activePackage.value = { name: props.name, bulkModeEnabled: false }
}

function onSearch() {
  router.push('/market?keyword=' + encodeURIComponent(props.name))
}

</script>

<style lang="scss" scoped>

.install-link {
  color: var(--accent);
  cursor: pointer;
}

</style>
