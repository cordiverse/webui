<template>
  <k-content v-if="currentEntry">
    <el-button
      @click="router.replace('/plugins/' + currentEntry.id)">
      <k-icon name="arrow-left" class="h-3.25 mr-2"/>
      回到概览
    </el-button>
    <h2>依赖项</h2>
    <k-comment
      v-for="({ required, location }, name) in env.using" :key="name"
      :type="location ? 'success' : required ? 'warning' : 'primary'">
      <p>
        {{ required ? '必需' : '可选' }}服务 {{ name }} {{ location ? '已加载' : '未加载' }}。
      </p>
    </k-comment>
    <el-button>添加依赖项</el-button>
    <h2>隔离域</h2>
    <p>该插件当前未配置隔离域。</p>
    <el-button>创建隔离域</el-button>
  </k-content>
</template>

<script lang="ts" setup>

import { computed } from 'vue'
import { router, useContext } from '@cordisjs/client'

const ctx = useContext()

const currentEntry = computed(() => ctx.manager.currentEntry!)
const local = computed(() => ctx.manager.data.value.packages[currentEntry.value.name])
const env = computed(() => ctx.manager.getEnvInfo(currentEntry.value)!)

</script>
