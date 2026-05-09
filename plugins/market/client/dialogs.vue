<template>
  <detail-dialog/>
  <confirm-dialog/>
  <manual-dialog/>
</template>

<script lang="ts" setup>

import { computed, provide } from 'vue'
import { useRpc } from '@cordisjs/client'
import type { Data } from '../src'
import DetailDialog from './detail.vue'
import ConfirmDialog from './confirm.vue'
import ManualDialog from './manual.vue'
import { kActivePackage, kPackagesMap, kDependencies, kRefresh, kShowConfirm, kShowManual } from './context'
import { activePackage, showConfirm, showManual } from './store'

const data = useRpc<Data>()

const market = computed(() => data.value?.market)
const deps = computed(() => data.value?.dependencies ?? {})
const packagesMap = computed(() => market.value?.data ?? {})

function requestRefresh() {
  data.value?.refresh()
}

provide(kActivePackage, activePackage)
provide(kPackagesMap, packagesMap)
provide(kDependencies, deps)
provide(kRefresh, requestRefresh)
provide(kShowConfirm, showConfirm)
provide(kShowManual, showManual)

</script>
