// استيراد خادم Deno ومكتبة Claude
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import Anthropic from "npm:@anthropic-ai/sdk"

// إعدادات CORS للسماح لتطبيق React بالاتصال بالدالة
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // معالجة طلبات OPTIONS الخاصة بالمتصفح (Preflight)
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // 1. استلام البيانات من تطبيقك (React)
    const { message } = await req.json()

    // 2. تهيئة Claude بالمفتاح السري المحفوظ في بيئة Supabase
    const anthropic = new Anthropic({
      apiKey: Deno.env.get('ANTHROPIC_API_KEY')
    })

    // 3. إرسال الطلب إلى Claude
    const response = await anthropic.messages.create({
      model: "claude-3-5-sonnet-20240620", // النموذج المعتمد
      max_tokens: 1024,
      messages: [{ role: "user", content: message }],
      system: "أنت محاسب مالي ذكي ومستشار أعمال لنظام نقاط بيع يسمى 'رصيد'. أجب باختصار واحترافية وبشكل مباشر يفيد التاجر."
    })

    // 4. إرجاع النتيجة لتطبيقك
    return new Response(
      JSON.stringify({ reply: response.content[0].text }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error("Error:", error)
    return new Response(
      JSON.stringify({ error: "حدث خطأ أثناء معالجة البيانات." }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})