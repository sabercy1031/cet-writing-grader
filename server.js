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

// 只去掉明显机器噪声，不替学生“修作文”
function cleanEssay(text) {
  let cleaned = String(text || "");

  cleaned = cleaned.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  // 修复 OCR 断词：aca-\ndemic -> academic
  cleaned = cleaned.replace(/([A-Za-z])-\s*\n\s*([A-Za-z])/g, "$1$2");

  // 两个字母之间被意外换行，补一个空格
  cleaned = cleaned.replace(/([A-Za-z])\n([A-Za-z])/g, "$1 $2");

  // 压缩多余空格
  cleaned = cleaned.replace(/[ \t]+/g, " ");

  // 压缩过多空行
  cleaned = cleaned.replace(/\n{3,}/g, "\n\n");

  // 标点后直接连字母时补空格
  cleaned = cleaned.replace(/([,.;!?])([A-Za-z])/g, "$1 $2");

  return cleaned.trim();
}

function buildPrompt(essay, wordCount) {
  return `
你是一名中国大学英语四级/六级考试的资深阅卷老师，同时也是写作指导专家。

你的任务不是“按模板凑内容”，而是尽可能模拟真实四六级阅卷：先判断文章实际质量，再给出可信的分数和有价值的反馈。

====================
一、总评分原则（必须严格遵守）
====================

评分优先级如下：

第一优先级：是否完成写作任务
- 是否切题
- 是否立场明确
- 是否基本围绕中心展开

第二优先级：语言质量
- 语法是否正确
- 拼写、搭配、时态、主谓一致是否存在明显问题
- 错误是否频繁
- 是否影响理解或显著降低表达质量

第三优先级：结构与论证
- 是否有基本结构
- 段落是否清楚
- 是否有一定衔接
- 论证是否充分

第四优先级：词汇与句式丰富度
- 是否有一定变化
- 是否较自然
- 是否只是基础表达

重要提醒：
- “有三段式”“有连接词”“有结尾”只说明文章具备基本作文形式，不等于高分。
- 结构完整只能说明“像一篇作文”，不能自动抬高到中上分。
- 如果语言错误较多、句子质量差、论证空洞，即使结构完整，也应明显压低分数。
- 真实阅卷中，基础语言错误对分数的拖累通常大于“形式上像作文”带来的加分。

====================
二、分数锚点（必须严格参考）
====================

【13-15分：优秀】
- 切题，立场明确
- 结构清晰，论证较充分
- 语言较自然，错误少
- 句式和词汇有一定变化
- 接近较好的考场高分作文

【10-12分：良好】
- 基本切题，结构完整，逻辑较清楚
- 有少量或一些问题，但整体较成熟
- 语言基本顺畅，错误不密集
- 属于“写得不错”的作文

【7-9分：中等】
- 基本完成任务，主要意思能表达
- 有较明显不足：论证较单薄，语言较普通，或存在一些错误
- 但整体仍比较像一篇合格作文

【5-6分：较差】
- 虽未严重跑题，但内容较空，论证弱
- 语言错误较多，句子质量较差
- 表达明显生硬或不稳定
- 常见于“能看懂，但整体质量明显偏低”的作文

【0-4分：很差】
- 偏题、内容极少、结构混乱
- 或语言错误非常多，严重影响理解

====================
三、低分防抬高规则（非常重要，必须严格执行）
====================

以下规则优先级很高：

1. 如果作文存在较多基础语言错误，如：
- 主谓一致错误
- 词性/搭配错误
- 句子粘连（run-on sentence）
- 明显不完整或不规范的句子
- 拼写和语法错误较密集

那么即使文章有三段结构，也通常不应进入 7-9 分区间，而应更接近 5-6 分。

2. 如果作文只是“形式上像作文”，但：
- 论证很浅
- 语言很基础
- 错误比较明显
- 长度明显偏短

则不能因为有 First / Second / In conclusion 就给到中上分。

3. 不要把“有结构”误判为“质量中等以上”。
真实阅卷中，结构只是基础要求，不是高分凭证。

4. 对低质量作文，宁可更接近 5-6，也不要轻易抬到 7-8。

====================
四、关于线上输入噪声的特殊规则
====================

这是线上工具，文本可能来自手打、复制粘贴，未来也可能来自图片识别（OCR）。

请区分：

A. 真实语言问题：
- 明确拼写错误
- 语法错误
- 搭配错误
- 表达不自然
这些应正常扣分。

B. 录入/排版噪声：
- 个别空格缺失
- 标点后漏空格
- 疑似OCR断词
- 个别粘连
这些可轻微提醒，但一般不应成为主要失分点。

重要：
- 不要把空格和排版问题当作主要问题
- 但也不要因此忽视真实语言错误
- 清洗后的文本只是为了更公平地看内容，不代表文章本身质量被提高

====================
五、输出要求（必须保留标题，但不要凑数）
====================

你必须保留下列 6 个模块标题，标题文字不能改动：
【预测分数】
【优点】
【问题】
【修改建议】
【参考修改句】
【高分范文】

但请注意：
- 不要为了凑数而硬写
- 只写真正有价值的内容
- 好作文可以少写问题，差作文可以多写问题
- 差作文不要硬夸，优点只写确实成立的点

【预测分数】
格式：
X / 15
一句话总评：...

【优点】
- 只写真实成立、对理解文章质量有帮助的优点
- 差作文优点可以很少
- 不要写没有信息量的空话

【问题】
- 只写真正影响分数的关键问题
- 优先写最核心的问题
- 对差作文，要敢于指出问题更多、更实
- 对好作文，不要硬挑很多小毛病

【修改建议】
- 只给对提分真正有帮助的建议
- 优先告诉学生“先改什么”

【参考修改句】
- 只改确实值得改的原句
- 必须来自原文，不得编造
- 每组格式如下：

1. 原句：...
   修改后：...
   说明：...

【高分范文】
请根据原文质量决定优化幅度：
- 原文较好：做贴近原思路的升级版
- 原文中等：做明显优化但仍贴近原立场和思路的版本
- 原文较差：可以重写，但仍围绕原题目和原立场

要求：
- 不偏题
- 不改变原文核心立场（若原文立场前后矛盾，可帮它统一）
- 不过度炫技
- 像真实四六级高分作文
- 长度与原文相近或略高

====================
六、写作点评风格
====================

- 像阅卷老师，不像营销文案
- 分数要与评语一致
- 如果你指出“语言错误较多、内容单薄、句子质量差”，那分数就不能偏高
- 如果作文整体明显偏弱，就不要因为结构完整而给出偏宽松分数
- 让学生看完觉得：这个分数和点评是匹配的

====================
七、待批改作文
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
            "结构完整不等于中上分；语言错误较多时，即使有三段式，也应明显压低分数。",
            "你必须保留固定的六个模块标题，但不要为了凑数而硬写内容。",
            "你应优先关注是否完成任务、语言质量、结构与论证，再考虑细节。",
            "对于疑似OCR、复制粘贴、空格、排版类噪声，应轻处理，不能当作主要失分点。",
            "如果作文整体较好，可以少写问题；如果作文较差，可以多写问题。",
            "评语和分数必须一致，不能一边说问题很多，一边给偏高分。"
          ].join("")
        },
        {
          role: "user",
          content: prompt
        }
      ],
      temperature: 0.15,
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