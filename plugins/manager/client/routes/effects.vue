<template>
  <k-content v-if="currentEntry">
    <div class="flex flex-wrap gap-x-4 gap-y-2 my-8">
      <el-button
        @click="router.replace('/plugins/' + currentEntry.id)">
        <k-icon name="arrow-left" class="h-3.25 mr-2"/>
        回到概览
      </el-button>
    </div>

    <effect-tree :effects="currentEntry.effects!"/>
  </k-content>
</template>

<script lang="ts" setup>

import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useContext } from '@cordisjs/client'
import effectTree from '../components/effect-tree.vue'

const ctx = useContext()
const router = useRouter()

const currentEntry = computed(() => ctx.manager.currentEntry!)

</script>
