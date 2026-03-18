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

app.post("/score", async (req, res) => {
  const essay = req.body?.essay;

  if (!essay || essay.trim().length < 20) {
    return res.status(400).send("作文内容过短，请输入更完整的英文作文。");
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
    const prompt = `
你是一名中国大学英语四级/六级考试的资深阅卷老师，同时也是英语写作指导专家。

请严格依据中国大学英语四级/六级写作评分标准，对下面这篇英文作文进行专业评分、分析和改写，并且必须严格按照指定格式输出。

【评分要求】
- 分数范围为 0-15 分
- 评价必须具体、清晰、有教学意义
- 既要指出亮点，也要明确指出实际问题
- 语言风格要像真实阅卷老师，专业但易懂

【硬性输出要求】
- 必须完整输出以下 6 个模块
- 不得遗漏任何一个模块
- 不要添加多余标题，不要添加开场白，不要添加总结
- 全部使用中文回答，只有高分范文用英文
- 每个模块内容要尽量充实，不要写得过短

【输出格式】
【预测分数】
X / 15

【优点】
1. ...
2. ...
（至少2点）

【问题】
1. ...
2. ...
3. ...
（至少3点）

【修改建议】
1. ...
2. ...
（至少2点）

【参考修改句】
1. 原句：...
   修改后：...
2. 原句：...
   修改后：...
（至少2组）

【高分范文】
请基于原作文主题、立意和大致内容，重写一篇更高分、更自然、更符合四六级高分标准的完整英文范文。
要求：
- 不要偏题
- 逻辑更清晰
- 表达更地道
- 词汇和句式更丰富
- 长度与原文相近或略高一些
- 要像真实考场作文的高分版本，而不是过于夸张或学术化

【作文内容】
${essay}
`;

    const completion = await client.chat.completions.create({
      model: "deepseek-chat",
      messages: [
        {
          role: "system",
          content: "你是专业的中国大学英语四六级作文阅卷老师，擅长评分、纠错、教学分析与高分范文改写。你必须严格按用户要求的固定格式输出，不得省略模块。"
        },
        {
          role: "user",
          content: prompt
        }
      ],
      temperature: 0.3,
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