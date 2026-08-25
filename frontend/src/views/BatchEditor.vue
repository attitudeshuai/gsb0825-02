<template>
  <div class="page-container">
    <div class="page-header">
      <h2 class="page-title">{{ isEdit ? '编辑券批次' : '创建券批次' }}</h2>
      <el-button @click="router.back()">
        <el-icon><ArrowLeft /></el-icon>
        返回
      </el-button>
    </div>
    
    <el-card>
      <el-form :model="form" :rules="rules" ref="formRef" label-width="120px">
        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item label="批次名称" prop="name">
              <el-input v-model="form.name" placeholder="请输入批次名称" maxlength="100" show-word-limit />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="批次编码" prop="batchCode">
              <el-input v-model="form.batchCode" placeholder="留空自动生成" />
            </el-form-item>
          </el-col>
        </el-row>
        
        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item label="券类型" prop="couponType">
              <el-radio-group v-model="form.couponType">
                <el-radio label="fixed">满减券</el-radio>
                <el-radio label="discount">折扣券</el-radio>
                <el-radio label="direct">直减券</el-radio>
                <el-radio label="exchange">兑换券</el-radio>
                <el-radio label="shipping">运费券</el-radio>
              </el-radio-group>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <template v-if="form.couponType === 'discount'">
              <el-form-item label="折扣率" prop="discountRate">
                <el-input-number v-model="form.discountRate" :min="0.1" :max="0.99" :step="0.05" :precision="2" />
                <span class="ml-2">折</span>
              </el-form-item>
            </template>
            <template v-else>
              <el-form-item label="面额" prop="faceValue">
                <el-input-number v-model="form.faceValue" :min="0" :precision="2" />
                <span class="ml-2">元</span>
              </el-form-item>
            </template>
          </el-col>
        </el-row>
        
        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item label="总数量" prop="totalQuantity">
              <el-input-number v-model="form.totalQuantity" :min="1" />
              <span class="ml-2">张</span>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="投放策略" prop="deliveryStrategy">
              <el-select v-model="form.deliveryStrategy" style="width: 200px">
                <el-option label="用户主动领取" value="receive" />
                <el-option label="手动发放" value="manual" />
                <el-option label="兑换码兑换" value="redeem" />
                <el-option label="定向推送" value="targeted" />
                <el-option label="新人券（需外部触发）" value="new_user" />
              </el-select>
            </el-form-item>
          </el-col>
        </el-row>

        <el-alert
          v-if="form.deliveryStrategy === 'new_user'"
          title="新人券策略说明：系统不包含用户注册模块，无法在用户注册时自动发券。创建后可由外部注册系统调用领取接口发放，或由运营通过「手动发放」功能发给指定用户。"
          type="warning"
          :closable="false"
          show-icon
          style="margin-bottom: 18px"
        />
        
        <el-row v-if="form.couponType === 'discount'" :gutter="20">
          <el-col :span="12">
            <el-form-item label="最高减免" prop="maxDiscount">
              <el-input-number v-model="form.maxDiscount" :min="0" :precision="2" />
              <span class="ml-2">元</span>
            </el-form-item>
          </el-col>
        </el-row>
        
        <el-row v-if="form.deliveryStrategy === 'redeem'" :gutter="20">
          <el-col :span="12">
            <el-form-item label="券码前缀">
              <el-input v-model="form.codePrefix" placeholder="可选，留空随机生成" maxlength="10" />
            </el-form-item>
          </el-col>
        </el-row>
        
        <el-divider content-position="left">使用规则</el-divider>
        
        <RuleBuilder v-model="ruleForm" />
        
        <el-divider content-position="left">批次描述</el-divider>
        
        <el-form-item label="描述">
          <el-input v-model="form.description" type="textarea" :rows="3" placeholder="请输入批次描述" maxlength="500" show-word-limit />
        </el-form-item>
        
        <el-divider content-position="left">预览</el-divider>
        
        <CouponPreview
          :coupon-type="form.couponType"
          :face-value="form.faceValue || 0"
          :discount-rate="form.discountRate"
          :name="form.name || '优惠券名称'"
          :min-amount="form.minAmount"
          :description="form.description || '优惠券描述'"
        />
        
        <el-form-item class="mt-8">
          <el-button type="primary" :loading="loading" @click="handleSubmit">
            {{ isEdit ? '保存修改' : '创建批次' }}
          </el-button>
          <el-button @click="router.back()">取消</el-button>
        </el-form-item>
      </el-form>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { ArrowLeft } from '@element-plus/icons-vue'
import { useCouponStore } from '@/stores/couponStore'
import { CouponBatch } from '@/api/couponApi'
import CouponPreview from '@/components/CouponPreview.vue'
import RuleBuilder from '@/components/RuleBuilder.vue'

const route = useRoute()
const router = useRouter()
const couponStore = useCouponStore()

const formRef = ref()
const loading = ref(false)

const isEdit = computed(() => !!route.params.id)
const batchId = computed(() => parseInt(route.params.id as string))

const form = reactive<CouponBatch>({
  name: '',
  batchCode: '',
  couponType: 'fixed',
  faceValue: 10,
  discountRate: 0.9,
  minAmount: 0,
  maxDiscount: undefined,
  totalQuantity: 100,
  limitPerPerson: 1,
  validityType: 'fixed',
  validDays: 30,
  scope: 'all',
  allowStacking: false,
  deliveryStrategy: 'receive',
  description: '',
  codePrefix: ''
})

const ruleForm = ref<any>({
  minAmount: 0,
  limitPerPerson: 1,
  validityType: 'fixed',
  validDays: 30,
  scope: 'all',
  allowStacking: false,
  stackingRules: {}
})

const rules = {
  name: [{ required: true, message: '请输入批次名称', trigger: 'blur' }],
  couponType: [{ required: true, message: '请选择券类型', trigger: 'change' }],
  faceValue: [{ required: true, message: '请输入面额', trigger: 'blur' }],
  discountRate: [{ required: true, message: '请输入折扣率', trigger: 'blur' }],
  totalQuantity: [{ required: true, message: '请输入总数量', trigger: 'blur' }],
  deliveryStrategy: [{ required: true, message: '请选择投放策略', trigger: 'change' }]
}

const loadBatchDetail = async () => {
  if (!isEdit.value) return
  
  try {
    const data = await couponStore.fetchBatchDetail(batchId.value)
    Object.assign(form, data)
    Object.assign(ruleForm.value, data)
  } catch (error) {
    console.error('Failed to load batch detail:', error)
  }
}

const handleSubmit = async () => {
  if (!formRef.value) return
  
  await formRef.value.validate(async (valid: boolean) => {
    if (!valid) return
    
    loading.value = true
    try {
      const submitData: any = {
        ...form,
        ...ruleForm.value
      }
      
      if (isEdit.value) {
        await couponStore.updateExistingBatch(batchId.value, submitData)
        ElMessage.success('修改成功')
      } else {
        await couponStore.createNewBatch(submitData)
        ElMessage.success('创建成功')
      }
      
      router.push('/batches')
    } catch (error) {
      console.error('Submit failed:', error)
    } finally {
      loading.value = false
    }
  })
}

onMounted(() => {
  loadBatchDetail()
})
</script>

<style scoped lang="scss">
.mt-8 {
  margin-top: 32px;
}

.ml-2 {
  margin-left: 8px;
}
</style>
