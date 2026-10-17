-- Knowledge Base: Public (everyone) or Private (only the people picked, plus the editors). Admin, HR and Manager edit.
alter table public.kb_articles
  add column if not exists visibility text not null default 'public' check (visibility in ('public', 'private')),
  add column if not exists allowed_ids uuid[] not null default '{}';

create or replace function public.can_edit_kb() returns boolean
language sql stable as $$ select coalesce(public.current_role_name() in ('admin', 'hr', 'manager'), false) $$;

drop policy if exists "kb read" on public.kb_articles;
create policy "kb read" on public.kb_articles for select to authenticated
  using (public.current_role_name() is not null and (visibility = 'public' or public.can_edit_kb() or auth.uid() = any (allowed_ids)));
drop policy if exists "kb admin write" on public.kb_articles;
create policy "kb admin write" on public.kb_articles for all to authenticated using (public.can_edit_kb()) with check (public.can_edit_kb());

-- Missing items from the Knowledge Base sheet (title is the key; existing rows are left alone)
create unique index if not exists kb_articles_title_uidx on public.kb_articles (category, title);
insert into public.kb_articles (category, title, url, body, visibility) values
 ('Useful Link', '早会 Zoom link', 'https://us06web.zoom.us/j/88516375504?pwd=pqCaQwcMZjfsIasIUJC1jxZHQ1yMkg.1', null, 'public'),
 ('Useful Link', 'Webinar Zoom link', 'https://us06web.zoom.us/j/83258501563?pwd=tNTTD3GqbyRbGZqaQkKEdk4QCa7Pxa.1', null, 'public'),
 ('Useful Link', 'Customer company logos (Drive folder)', 'https://drive.google.com/drive/u/5/folders/1uBcKGemT9OAyq8GsrkgGiOybHBAGedzP', null, 'public'),
 ('Useful Link', 'AIGOAL Onboarding List', 'https://docs.google.com/spreadsheets/d/1V9kO1JoBb4WgWd5D3OUqgffIhvJ-h5ueN3smlZGsG90/edit?gid=0#gid=0', null, 'public'),
 ('Useful Link', 'AI STUDIO Customer List', 'https://docs.google.com/spreadsheets/d/1e2AabiDDZ3CBAdBs0cykAVqb2BsXo_pZHSXD6cIY3bQ/edit?gid=2067449864#gid=2067449864', null, 'private'),
 ('Useful Link', 'AI STUDIO Coaching', 'https://docs.google.com/spreadsheets/d/1xne5l-EBi_fod8gkM6luXSXmtoE2JURXR3wiprqKsU8/edit?gid=0#gid=0', null, 'public'),
 ('Sales Report', 'Ads Report', 'https://docs.google.com/spreadsheets/d/1e2AabiDDZ3CBAdBs0cykAVqb2BsXo_pZHSXD6cIY3bQ/edit?usp=sharing', null, 'private'),
 ('Sales Report', 'Sales Report', 'https://docs.google.com/spreadsheets/d/13Fw9PCF9RvVxfnzmZl-Cvy1AthIDc8fgSSGLZq19EAw/edit?gid=1999993543#gid=1999993543', null, 'private'),
 ('名单', '成交名单', 'https://docs.google.com/spreadsheets/d/1e2AabiDDZ3CBAdBs0cykAVqb2BsXo_pZHSXD6cIY3bQ/edit?gid=2067449864#gid=2067449864', null, 'private'),
 ('名单', 'Qai & Aigoal GHL 总名单', 'https://docs.google.com/spreadsheets/d/1bbPRlGKjs-Aojn5ET8dG9ySrEUj81BhUFG6PDESHlnY/edit?usp=drive_link', null, 'private'),
 ('名单', 'AIGOAL Account List', 'https://docs.google.com/spreadsheets/d/1llze-ip3s7hztTlWWvMbI-Y-yFFeGhqQ9mKVO_Ru4Sw/edit?gid=0#gid=0', null, 'private'),
 ('名单', 'Webinar Leads — Winson', 'https://docs.google.com/spreadsheets/d/1qmZNVJJGdqm4HlitVBNN3Mii9fyEqzSVP5pZS72D-VE/edit?gid=1868645150#gid=1868645150', null, 'private'),
 ('名单', 'Webinar Leads — Aaron', 'https://docs.google.com/spreadsheets/d/1AgpJhvsNKpHUabEmMDOiYrc1h6J9X2tBYFDJjE8knpc/edit?gid=1692071434#gid=1692071434', null, 'private'),
 ('Payment & Pricing', 'Price List (Latest 2 Oct 2026)', 'https://drive.google.com/file/d/1_mmJ7F70YfE9p1OdetZhNriMJ4GWix0d/view?usp=share_link', null, 'public'),
 ('Payment & Pricing', 'AIGOAL Poster (Chinese)', 'https://drive.google.com/file/d/1tIQtsv3GMWbZyaAwWFNeAbeBxeQ36Vos/view?usp=share_link', null, 'public'),
 ('Payment & Pricing', 'AI STUDIO Poster (Chinese)', 'https://drive.google.com/file/d/1B_CS2EGURhxVw26HRE8XMHylC0ubUHYM/view?usp=share_link', null, 'public'),
 ('Payment & Pricing', 'Payment Link: AI Studio (RM1,800)', 'https://buy.stripe.com/14A8wP0fAblh9OAc2x1ZS07', 'RM1,800 + 8% SST = RM1,944', 'public'),
 ('Payment & Pricing', 'Payment Link: AIGOAL Top Up Difference (RM3,198)', 'https://buy.stripe.com/aFa00jd2m9d9bWI3w11ZS06', 'RM4,998 − RM1,800 = RM3,198 + 8% SST = RM3,453.84', 'public'),
 ('Payment & Pricing', 'Payment Link: AIGOAL 1 Year Subscription (RM4,998)', 'https://buy.stripe.com/3cI9ATgeyextbWI4A51ZS03', 'RM4,998 + 8% SST = RM5,397.84', 'public'),
 ('Payment & Pricing', 'Payment Link: AIGOAL Trial 3 Months (RM2,100)', 'https://buy.stripe.com/eVq9ATgeygFBgcYaYt1ZS0k', 'RM2,100 + 8% SST = RM2,268.00', 'public'),
 ('Payment & Pricing', 'Payment Link: AIGOAL After Trial 3 Months (RM2,898)', 'https://buy.stripe.com/dRm7sL8M69d95ykd6B1ZS0l', 'RM2,898 + 8% SST = RM3,129.84', 'public'),
 ('Payment & Pricing', 'Bank Account Info', null, E'GRAND VISION X SDN BHD\nPUBLIC BANK\n3240229525', 'public'),
 ('E-Invoice', 'E-Invoice Request Form', 'https://aigoal-receipt-einvoice.aigoal.ai', 'Customers request their e-Invoice here. Must be submitted within the month of payment.', 'public'),
 ('E-Invoice', 'E-Invoice Request Form (old Google Form — outdated)', 'https://docs.google.com/forms/d/e/1FAIpQLSfkmbvZiOw3StF9rqJjrJMtBfs0zIAT66v0fzv8WTHDZ56Arg/viewform?usp=dialog', 'Outdated. Use the new form above.', 'public'),
 ('E-Invoice', 'WhatsApp — e-Invoice reminder', 'https://aigoal-receipt-einvoice.aigoal.ai', E'Hi guys，a reminder for the invoice submission～ 🤗\n\n📢 e-Invoice 申请提醒\n\n📌 请注意：如需申请 e-Invoice，请在付款当月内提交申请表，以便我们及时为你们处理～\n\n例如：\n💳 9月10日付款\n➡️ 于 9月份内 提交申请\n\n如需要 e-Invoice，请尽快填写以下申请表，以便我们后台及时帮你安排 e-Invoice 🤗🙏🏻\n\n📝 E-Invoice Request Form：\n🔗 https://aigoal-receipt-einvoice.aigoal.ai', 'public'),
 ('Service Line', 'AIGOAL service numbers', null, E'60182876319 (WABA)\n0105915319 (Bryan)\n0176374934 (Winson)', 'public'),
 ('Service Line', 'AI Studio service number', null, '60139928319 (Ellin)', 'public'),
 ('Scripts', 'WhatsApp — 2nd message (1-to-1 AI Coaching)', 'https://aigoal-ai-conversion-onboarding-131.aigoal.ai', E'🎯 *【1-to-1 AI Coaching】*\n\n为了协助大家搭建好 *AIGOAL* 系统，我们特别安排了 约 30 分钟的 1-to-1 Coaching 🤝\n\n我们会了解你的行业、目前的使用情况，以及你遇到的问题，然后针对性地给予建议和解决方案 🚀\n\n📅 预约你的专属时段： 👇🏽\nhttps://aigoal-ai-conversion-onboarding-131.aigoal.ai\n\n期待和你一对一交流！🔥🤖', 'public'),
 ('Scripts', '【AI Goal 转化系统搭建条款】', null, E'【AI Goal 转化系统搭建条款】\n\n为帮助各位顺利落地使用全新AI系统，我们将为您提供专属系统搭建协助🤝\n搭建服务周期：1个月，以首次1‑To‑1 Coaching 当日为基准。\n\n📌 整个流程分为 3 次 Coaching：\n\n1️⃣ 第一次 Coaching｜了解 + 搭建 我们会了解你的行业、产品、客户及需求，并收集资料，开始帮你搭建 🤖 AI Chat Bot；如有需要，也会协助搭建 Landing Page。\n\n2️⃣ 第二次 Coaching｜测试 + 优化 你实际试用系统，把遇到的问题和需要调整的地方告诉我们，我们会根据你的反馈进行优化 🔧\n\n3️⃣ 第三次 Coaching｜教学 + 交接 大约一星期后进行最后一次 Coaching，完成系统优化、教学及正式交接 🎓\n\n🎯 交接之后 你可以自己操作系统，有任何使用上的问题都可以在群里询问我们。\n\n如果你不想自己操作，也可以选择交给我们公司长期管理 🙋‍♂️，管理服务将会另外收费。\n\n⚠️ 温馨提醒： 系统搭建需要客户配合提供完整及准确的资料；AI 也无法保证每一次回答 100% 正确。若后续需要大规模修改、增加新功能或重新搭建其他系统，则可能需要另外收费。\n\n❤️ 我们的目标很简单：\n不是把一个 AI 系统卖给你\n而是陪你把 AI 真正用进你的生意里！🚀', 'public'),
 ('Scripts', 'Webinar offer — 只限今晚 (首5位抢购)', 'https://wa.link/h75pxd', E'只限今晚！点击 Lock 下 优惠：\nhttps://wa.link/h75pxd\n\n首5位抢购 🔥先到先得～\n\n1️⃣ 24小时有策略的AI客服跟进成交顾客\n2️⃣ 超级细心的AI销售主管\n3️⃣ 无限ai全漏斗设计与自动化\n4️⃣ AI客服关系高管\n5️⃣ 线下企业AI实战课程\n6️⃣ 1对1 AI Chat bot and funnel set up and consult\n7️⃣ 附送完整 AI 超级流量系统和 CREDIT\n\n《线下课程时间》：\n📅日期：11月21-22日\n⏰时间：10am - 6pm\n📍地点：（KL）\n\n🏦Bank Transfer:\nPublic Bank 3240229525\nGrand Vision X Sdn Bhd\n\nRM4998 (还没加 8% Tax)\n\n🔗Payment Link：\nhttps://buy.stripe.com/3cI9ATgeyextbWI4A51ZS03\n\n此优惠请勿错过 🔥', 'public'),
 ('Scripts', 'Offline class — 课前提醒', 'https://studio.aigoal.ai/auth', E'*【AIGOAL A.I.】*课前提醒 🔔\n\n大家好～ 🤗 明天就是课程了，麻烦大家先完成以下准备哦！😊\n\n•••报名者可以先留意以下资讯 •••\n1️⃣ 课前准备\n• ✅ 先尝试登入系统\n👉🏻🔗 系统登录链接： https://studio.aigoal.ai/auth\n• 💻 请自备电脑（建议先确认可正常使用）\n\n2️⃣ 请准备以下照片（原图、清晰、未经编辑）\n• 正面照\n• 侧面照\n• 微笑露齿照\n\n______________________\n📌 课程资讯\n• 🕘 Time： 10:00 – 18:00\n• 🗓️ Date：24/9 & 25/9（Thursday & Friday）\n• 📍 Address：W701, Metropolitan Square, Jalan PJU 8/1, Damansara Perdana, 47820 Petaling Jaya, Selangor\n\n📍Waze: https://waze.com/ul/hw28600jxq\n📍Google Map: https://maps.app.goo.gl/ZzaiNFa8PK4Th3sEA?g_st=ic\n\n请大家提前完成以上准备，当天就可以更顺利地跟上课程进度。期待见到大家！✨', 'public'),
 ('Design Reference', 'Designeer — UI design references', 'https://www.designeer.xyz', 'One website, got all UI design reference', 'public'),
 ('Design Reference', 'UIUX Pro', 'https://uupm.cc', 'Skills impeccable and UIUX pro 来设计', 'public')
on conflict (category, title) do nothing;
