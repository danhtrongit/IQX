<script setup lang="ts">
import { h, onMounted, ref } from "vue"
import { RouterLink, useRouter } from "vue-router"
import { Plus } from "lucide-vue-next"
import { NButton, NCard, NInput, NSelect, NSpace, type DataTableColumns } from "naive-ui"
import RemoteDataTable from "@/components/table/RemoteDataTable.vue"
import StatusTag from "@/components/common/StatusTag.vue"
import ErrorState from "@/components/common/ErrorState.vue"
import { fmtDateTime } from "@/lib/format"
import { useRemotePage } from "@/composables/useRemotePage"
import { lessonsApi, type CourseLevel, type CourseRow } from "@/lib/api/lessons"

const router = useRouter()
const searchText = ref(""); const level = ref<CourseLevel | null>(null); const publishState = ref<"published" | "draft" | null>(null)
const page = useRemotePage<CourseRow>((p) => lessonsApi.list({ page: Number(p.page), pageSize: Number(p.pageSize), search: searchText.value || undefined, level: level.value || undefined, isPublished: publishState.value ? publishState.value === "published" : undefined }))
const columns: DataTableColumns<CourseRow> = [
  { title: "Tiêu đề", key: "title", minWidth: 260, render: (row) => h(RouterLink, { to: `/lessons/${row.id}` }, { default: () => row.title }) },
  { title: "Slug", key: "slug", className: "mono" },
  { title: "Level", key: "level" },
  { title: "Premium", key: "isPremium", render: (row) => h(StatusTag, { status: row.isPremium, label: row.isPremium ? "Premium" : "Free" }) },
  { title: "Published", key: "isPublished", render: (row) => h(StatusTag, { status: row.isPublished }) },
  { title: "Episodes", key: "totalEpisodes" },
  { title: "Cập nhật", key: "updatedAt", render: (row) => fmtDateTime(row.updatedAt) },
]
function search() { void page.load({ page: 1 }) }
onMounted(() => void page.load())
</script>
<template><div class="page-stack"><div class="page-header"><div><h1 class="page-title">Khoá học</h1><p class="page-subtitle">{{ page.total.value }} khoá học</p></div><n-button type="primary" @click="router.push('/lessons/new')"><template #icon><Plus :size="16" /></template>Tạo khoá học</n-button></div><n-card><n-space wrap><n-input v-model:value="searchText" clearable placeholder="Tìm khoá học" style="width: 260px" @keyup.enter="search" /><n-select v-model:value="level" clearable :options="['beginner','intermediate','advanced'].map((value) => ({ label: value, value }))" placeholder="Level" style="width: 180px" /><n-select v-model:value="publishState" clearable :options="[{ label: 'Published', value: 'published' }, { label: 'Draft', value: 'draft' }]" placeholder="Publish" style="width: 160px" /><n-button type="primary" @click="search">Lọc</n-button></n-space></n-card><ErrorState v-if="page.error.value" :message="page.error.value" @retry="page.load" /><RemoteDataTable :columns="columns" :rows="page.rows.value" :loading="page.loading.value" :page="page.params.page" :page-size="page.params.pageSize" :item-count="page.total.value" @page-change="page.setPage" @page-size-change="page.setPageSize" /></div></template>
