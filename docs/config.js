/**
 * GitHub Pages 版本配置
 *
 * backend 固定为 supabase；把下面两项换成你的 Supabase 项目信息：
 * - url：Project Settings → API → Project URL
 * - anonKey：Project Settings → API → anon public key（可以公开，不要用 service_role）
 */
window.BIRTHDAY_CONFIG = {
  name: '蒙昊',
  subtitle: '生日快乐，愿你的每一天都像烟花一样闪闪发光',
  backend: 'supabase',
  supabase: {
    url: '',
    anonKey: ''
  }
};
