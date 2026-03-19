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
app.use(express.json());

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
  if (!fs.existsSync(indexPath)) {
    return res.status(500).send("index.html not found");
  }
  res.sendFile(indexPath);
});


// ✅ 轻度文本清洗（只处理机器噪声）
function cleanEssay(text) {
  if (!text) return text;

  let cleaned = text;

  // 修复断词：aca-\n demic → academic
  cleaned = cleaned.replace(/-\s*\n\s*/g, "");

  // 多空格 → 单空格
  cleaned = cleaned.replace(/[ \t]+/g, " ");

  // 多换行压缩
  cleaned = cleaned.replace(/\n{3,}/g, "\n\n");

  // 修复明显的换行断句（简单处理）
  cleaned = cleaned.replace(/([a-zA-Z])\n([a-zA-Z])/g, "$1 $2");

  return cleaned.trim();
}


app.post("/score", async (req, res) => {
  let essay = req.body?.essay;

  if (!essay || essay.trim().length < 20) {
    return res.status(400).send("作文内容过短，请输入更完整的英文作文。");
  }

  // ✅ 先做轻度清洗
  const cleanedEssay = cleanEssay(essay);

  const apiKey = process.env.DEEPSEEK_API_KEY;

  if (!apiKey) {
    return res.status(500).send("服务器未配置 DEEPSEEK_API_KEY。");
  }

  const client = new OpenAI({
    baseURL: "https://api.deepseek.com",
    apiKey
  });

  try {
    const prompt = `
你是一名中国大学英语四级/六级考试的资深阅卷老师，同时也是英语写作指导专家。

请严格依据中国大学英语四级/六级写作评分标准，对下面这篇英文作文进行专业评分、分析和改写。

【核心评分原则（非常重要）】
1. 优先评估：结构、逻辑、论证质量
2. 其次评估：语言准确性（语法、拼写、搭配）
3. 最后评估：格式与细节问题

【重要规则（必须遵守）】
- 请区分“真实语言错误”和“录入/排版问题”
- 如：
  空格缺失、换行断词、轻微拼写异常，可能来源于复制或OCR，不应重罚
- 但：
  明确拼写错误、语法错误、搭配错误，必须正常扣分

【问题模块要求（必须分层）】
问题部分请按以下优先级排序：

1. 核心问题（最重要）
   - 立场是否一致
   - 逻辑是否清晰
   - 论证是否充分

2. 语言问题（中等重要）
   - 语法错误
   - 搭配错误
   - 用词不当

3. 次要问题（轻描淡写）
   - 空格问题
   - 标点问题
   - 可能的OCR/复制问题（仅简要提及）

【评分要求】
- 分数范围：0-15
- 风格必须像真实阅卷老师
- 评分略偏严格（更接近真实考试）

【输出格式（必须严格）】

【预测分数】
X / 15

【优点】
1. ...
2. ...

【问题】
1. ...
2. ...
3. ...

【修改建议】
1. ...
2. ...

【参考修改句】
1. 原句：...
   修改后：...
2. 原句：...
   修改后：...

【高分范文】
要求：
- 必须基于原文进行优化，不要完全重写
- 保持原文立场
- 优化表达与结构
- 更自然、更像高分考场作文

【作文内容】
${cleanedEssay}
`;

    const completion = await client.chat.completions.create({
      model: "deepseek-chat",
      messages: [
        {
          role: "system",
          content: "你是专业四六级阅卷老师，评分必须稳定、真实、严格，并具有教学意义。"
        },
        {
          role: "user",
          content: prompt
        }
      ],
      temperature: 0.2, // 再降一点，提升稳定性
      stream: true
    });

    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Transfer-Encoding", "chunked");

    for await (const chunk of completion) {
      const content = chunk.choices?.[0]?.delta?.content;
      if (content) {
        res.write(content);
      }
    }

    res.end();
  } catch (error) {
    console.error("[SCORE ERROR]:", error);

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
});