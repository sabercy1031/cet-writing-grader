const express = require("express");
const cors = require("cors");
const OpenAI = require("openai");
const path = require("path");
const fs = require("fs");

const app = express();
const PORT = process.env.PORT || 3000;
const publicDir = path.resolve(__dirname, "public");
const indexPath = path.resolve(publicDir, "index.html");

app.use(cors());
app.use(express.json({ limit: "1mb" }));

app.use((req, res, next) => {
  console.log(`[REQ] ${req.method} ${req.url}`);
  next();
});

app.use(express.static(publicDir));

app.get("/health", (req, res) => {
  res.status(200).json({
    ok: true,
    port: PORT,
    publicDir,
    indexExists: fs.existsSync(indexPath)
  });
});

app.get("/", (req, res) => {
  console.log("[ROOT] trying to send:", indexPath);

  if (!fs.existsSync(indexPath)) {
    console.error("[ROOT] index.html not found:", indexPath);
    return res.status(500).send("index.html not found");
  }

  res.sendFile(indexPath, (err) => {
    if (err) {
      console.error("[ROOT] sendFile error:", err);
      if (!res.headersSent) {
        res.status(500).send("sendFile failed");
      }
    } else {
      console.log("[ROOT] index.html sent successfully");
    }
  });
});

function countWords(text) {
  const trimmed = String(text || "").trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).filter(Boolean).length;
}

// 只做轻度清洗：修机器噪声，不修学生真实水平
function cleanEssay(text) {
  let cleaned = String(text || "");

  // 统一换行
  cleaned = cleaned.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  // 修复 OCR/复制导致的断词：aca-\ndemic -> academic
  cleaned = cleaned.replace(/([A-Za-z])-\s*\n\s*([A-Za-z])/g, "$1$2");

  // 普通换行如果夹在两个字母之间，视作意外断开，补空格
  cleaned = cleaned.replace(/([A-Za-z])\n([A-Za-z])/g, "$1 $2");

  // 压缩过多空格和制表符
  cleaned = cleaned.replace(/[ \t]+/g, " ");

  // 压缩过多空行
  cleaned = cleaned.replace(/\n{3,}/g, "\n\n");

  // 标点后如果直接连字母，补一个空格（轻度）
  cleaned = cleaned.replace(/([,.;!?])([A-Za-z])/g, "$1 $2");

  return cleaned.trim();
}

function buildPrompt(essay, wordCount) {
  return `
你是一名中国大学英语四级/六级考试的资深阅卷老师，同时也是写作指导专家。

你的目标不是“完成模板”，而是尽可能模拟真实阅卷老师的判断方式：先判断作文质量，再决定说多少、说什么。不要为了凑格式而硬写内容。

====================
一、评分风格总原则（必须遵守）
====================

请尽量贴近真实四六级阅卷逻辑进行评分：
1. 优先看是否切题、立场是否明确、结构是否完整、论证是否基本成立
2. 其次看语言准确性，包括语法、拼写、搭配、表达自然度
3. 最后再看格式、标点、空格等细节问题
4. 评分应中性、稳健、可信，不要恶意压分，也不要为了鼓励而虚高
5. 整体风格接近真实老师，而不是营销式夸奖

====================
二、评分锚点（必须参考）
====================

请根据以下区间判断：

【13-15分：优秀】
- 紧扣题目，立场明确
- 结构完整清晰，论证较充分
- 语言较自然，错误较少且不影响理解
- 词汇和句式有一定变化
- 已接近较好的考场高分作文

【10-12分：良好】
- 基本切题，结构完整，论证较清楚
- 有一些语言问题或表达较平
- 整体是一篇合格到较好的作文
- 常见于“写得不错，但还不算特别强”的作文

【7-9分：中等】
- 基本完成任务，能表达主要意思
- 有较明显的论证不足、结构普通或语言问题
- 整体可读，但离高分有明显差距

【5-6分：较差】
- 内容较单薄，结构较弱，或语言错误较多
- 说理不充分，表达质量较低

【0-4分：很差】
- 严重偏题、内容极少、结构混乱或大量错误影响理解

额外要求：
- 不能因为用了几个连接词或看似高级词汇就轻易给高分
- 不能因为个别小错误就过度压分
- 如果整体质量较好，应敢于给到 10 分以上
- 如果整体较一般，也不要为了显得“高级”而拔高分数

====================
三、关于录入噪声的特殊规则（非常重要）
====================

这是一个线上批改工具，作文文本可能来自手动输入、复制粘贴，未来也可能来自图片识别（OCR）。

因此请区分：
1. 真实语言问题：如明确的拼写错误、语法错误、搭配错误、表达不自然 —— 这些应正常扣分
2. 录入/排版噪声：如个别空格缺失、标点后漏空格、换行断词、疑似OCR造成的粘连 —— 这些可以提醒，但一般不应作为主要失分点，更不要因此明显压低总分

重要：
- 不要把空格、排版、OCR痕迹当成核心问题
- 若确需提及，只能放在次要位置轻描淡写说明
- 评分仍应以内容、结构、逻辑、真实语言水平为主

====================
四、输出要求（必须严格遵守标题，但不要硬凑内容）
====================

你必须保留下列 6 个模块标题，且标题文字不能改动：
【预测分数】
【优点】
【问题】
【修改建议】
【参考修改句】
【高分范文】

但是：
- 不要为了凑数量而硬写
- 每个模块内容多少，应由作文实际质量决定
- 只写“有价值”的内容

具体要求如下：

【预测分数】
格式：
X / 15
一句话总评：...

【优点】
- 只写真正成立、对理解这篇作文有帮助的优点
- 如果作文较弱，优点可以很少，不要硬夸
- 如果作文较好，可以写得更充分
- 不要写空洞废话，如“文章完整”“表达清晰”这类没有信息量的话，除非它确实是亮点

【问题】
- 只列出真正影响分数的关键问题，数量由你判断
- 优先写核心问题：如切题、立场、结构、论证
- 再写必要的语言问题：如语法、拼写、搭配、表达不自然
- 空格、标点、OCR等问题，除非确有必要，否则不要占主要篇幅
- 不要为了凑数罗列琐碎小问题
- 如果作文整体较好，只写 1-2 个关键问题也可以
- 如果作文较差，可以写更多问题

【修改建议】
- 只给真正有助于提分的建议
- 要像老师指导学生，而不是空泛鼓励
- 优先告诉用户“先改什么、为什么改”
- 数量由你判断，不要凑数

【参考修改句】
- 只修改“确实值得修改”的原句
- 必须基于原文真实存在的句子，不得编造原句
- 如果原文只有少数句子值得改，就少写几组
- 每组格式如下：

1. 原句：...
   修改后：...
   说明：...

【高分范文】
请根据原文质量决定优化幅度：
- 如果原文较好：做“保留原思路的升级版”
- 如果原文中等：做“明显优化但仍贴近原文立场和思路的版本”
- 如果原文较差：可以较大幅度重写，但仍要尽量围绕原题目和原立场

要求：
- 不偏题
- 不改变原文核心立场（除非原文立场本身前后矛盾，你需要统一）
- 不要过于学术化或炫技
- 要像真实四六级考场中的高分版本
- 长度与原文相近或略高
- 不要为了显得高级而写得特别夸张

====================
五、写作点评风格要求
====================

- 像阅卷老师，不像广告文案
- 评价要真实、有判断感
- 好作文不要硬挑一堆毛病
- 差作文也不要只轻描淡写
- 让学生看完后觉得“这像老师改的”
- 如果是典型三段式议论文，可以关注：
  1）首段是否引出话题并表明观点
  2）主体是否围绕中心展开理由，并有基本衔接
  3）尾段是否总结并回扣立场
- 但不要机械地要求所有作文完全一个模子

====================
六、待批改作文信息
====================

作文词数：${wordCount}

【作文内容】
${essay}
`.trim();
}

app.post("/score", async (req, res) => {
  const essay = req.body?.essay;

  if (!essay || typeof essay !== "string") {
    return res.status(400).send("请提交英文作文内容。");
  }

  const trimmedEssay = essay.trim();
  const wordCount = countWords(trimmedEssay);

  if (wordCount < 30) {
    return res.status(400).send("作文词数过少，请至少输入 30 个词后再评分。");
  }

  const apiKey = process.env.DEEPSEEK_API_KEY;

  if (!apiKey) {
    return res.status(500).send("服务器未配置 DEEPSEEK_API_KEY。");
  }

  const client = new OpenAI({
    baseURL: "https://api.deepseek.com",
    apiKey
  });

  try {
    const cleanedEssay = cleanEssay(trimmedEssay);
    const prompt = buildPrompt(cleanedEssay, wordCount);

    const completion = await client.chat.completions.create({
      model: "deepseek-chat",
      messages: [
        {
          role: "system",
          content: [
            "你是专业的中国大学英语四六级作文阅卷老师。",
            "你必须尽量模拟真实考场阅卷风格：评分稳健、中性、可信。",
            "你必须保留固定的六个模块标题，但不要为了凑数而硬写内容。",
            "你应优先关注切题、立场、结构、论证、语言准确性，再考虑细节。",
            "对于疑似OCR、复制粘贴、空格、排版类噪声，应轻处理，不能当作主要失分点。",
            "如果作文整体较好，可以少写问题；如果作文较差，可以多写问题。"
          ].join("")
        },
        {
          role: "user",
          content: prompt
        }
      ],
      temperature: 0.2,
      stream: true
    });

    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Transfer-Encoding", "chunked");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("X-Accel-Buffering", "no");

    for await (const chunk of completion) {
      const content = chunk.choices?.[0]?.delta?.content;
      if (content) {
        res.write(content);
      }
    }

    res.end();
  } catch (error) {
    console.error("[SCORE] DeepSeek错误:", error);

    if (!res.headersSent) {
      res.status(500).send("AI评分失败，请检查服务器。");
    } else {
      res.write("\n\n[系统错误：评分过程中断]");
      res.end();
    }
  }
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`publicDir = ${publicDir}`);
  console.log(`indexPath = ${indexPath}`);
  console.log(`index exists = ${fs.existsSync(indexPath)}`);
});