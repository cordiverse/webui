<template>
  <k-content v-if="currentEntry">
    <el-button
      @click="router.replace('/plugins/' + currentEntry.id)">
      <k-icon name="arrow-left" class="h-3.25 mr-2"/>
      回到概览
    </el-button>

    <h2>依赖项</h2>
    <k-comment
      v-for="({ required, provider }, name) in env.using" :key="name"
      :type="provider ? 'success' : required ? 'warning' : 'primary'">
      <p>{{ required ? '必需' : '可选' }}服务 {{ name }} {{ provider ? '已加载' : '未加载' }}。</p>
    </k-comment>
    <el-button @click="showAddDependency = true">添加依赖项</el-button>

    <h2>隔离域</h2>
    <k-comment
      v-for="(label, name) in currentEntry.isolate" :key="name"
      :type="getService(name, label) ? 'success' : 'primary'"
    >
      <p>该插件为服务 {{ name }} 配置了{{ label ? `名为 ${label} 的共享` : '私有' }}隔离域。</p>
    </k-comment>
    <p>该插件当前未配置隔离域。</p>
    <el-button @click="showCreateIsolate = true">创建隔离域</el-button>
  </k-content>

  <el-dialog
    destroy-on-close
    v-model="showAddDependency"
    title="添加依赖项"
  >
    <p><el-input ref="inputEl" v-model="input" @keydown.enter.stop.prevent="addDependency"/></p>
    <template #footer>
      <el-checkbox v-model="isRequired">必需依赖</el-checkbox>
      <div class="grow-1">
        <el-button @click="showAddDependency = false">取消</el-button>
        <el-button type="primary" @click="addDependency">确定</el-button>
      </div>
    </template>
  </el-dialog>

  <el-dialog
    destroy-on-close
    v-model="showCreateIsolate"
    title="创建隔离域"
  >
    <p><el-input ref="inputEl" v-model="input"/></p>
    <p><el-input ref="inputEl" v-model="label" placeholder="留空时将创建私有隔离域"/></p>
    <template #footer>
      <el-button @click="showCreateIsolate = false">取消</el-button>
      <el-button type="primary" @click="createIsolate">确定</el-button>
    </template>
  </el-dialog>
</template>

<script lang="ts" setup>

import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { send, useContext, Inject } from '@cordisjs/client'

const ctx = useContext()
const router = useRouter()

const showAddDependency = ref(false)
const showCreateIsolate = ref(false)
const isRequired = ref(false)
const input = ref('')
const label = ref('')

const currentEntry = computed(() => ctx.manager.currentEntry!)
const services = computed(() => ctx.manager.data.value.services)
const env = computed(() => ctx.manager.getEnvInfo(currentEntry.value)!)

function getService(name: string, label: string | true) {
  if (!services.value[name]) return
  if (label === true) {
    return services.value[name].local[currentEntry.value.id]?.location
  } else {
    return services.value[name].global[label]?.location
  }
}

function addDependency() {
  send('manager.config.update', {
    id: currentEntry.value.id,
    inject: {
      ...Inject.resolve(currentEntry.value.inject),
      [input.value]: { required: isRequired.value },
    },
  })
}

function createIsolate() {
  send('manager.config.update', {
    id: currentEntry.value.id,
    isolate: {
      ...currentEntry.value.isolate,
      [input.value]: label.value || true,
    },
  })
}

</script>
