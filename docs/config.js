/**
 * GitHub Pages 版本配置
 *
 * backend 固定为 supabase；anon public key 可以公开，不要使用 service_role。
 * messagesSince 是本次生日页的展示起点：早于这个时间的旧留言不再进入页面。
 */
window.BIRTHDAY_CONFIG = {
  name: '谢Bro',
  subtitle: '生日快乐，愿你的每一天都像烟花一样闪闪发光',
  backend: 'supabase',
  messagesSince: '2026-10-19T13:05:00.000Z',
  supabase: {
    url: 'https://lqvoojtrdbimkzoxnucj.supabase.co',
    anonKey:
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxxdm9vanRyZGJpbWt6b3hudWNqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI0MDg1NDAsImV4cCI6MjEwNzk4NDU0MH0.acvWFG_n-VAdKMLU8vyDeafygIJJHUMXEyT29SCBP3U'
  }
};
