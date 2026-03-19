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
  if (!fs.existsSync(indexPath)) {
    return res.status(500).send("index.html not found");
  }
  res.sendFile(indexPath);
});

function countWords(text) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function cleanEssay(text) {
  let cleaned = text;

  cleaned = cleaned.replace(/\r\n/g, "\n");
  cleaned = cleaned.replace(/([A-Za-z])\n([A-Za-z])/g, "$1 $2");
  cleaned = cleaned.replace(/[ \t]+/g, " ");
  cleaned = cleaned.replace(/\n{3,}/g, "\n\n");
  cleaned = cleaned.replace(/([,.;!?])([A-Za-z])/g, "$1 $2");

  return cleaned.trim();
}

function buildPrompt(essay, wordCount) {
  return `
你是一名中国大学英语四六级阅卷老师，请根据真实考试标准评分。

【核心原则】
- 结构完整 ≠ 高分
- 语言错误多 → 必须降分
- 分数必须和评语一致

【评分区间】
13-15：优秀
10-12：良好
7-9：中等
5-6：较差
0-4：很差

【重要规则】
- 语言错误多 → ≤6分
- 内容空洞 → 降分
- 不要因三段式抬分
- 不要轻易给13+

【输出结构】
【预测分数】
X / 15

【优点】
...

【问题】
...

【修改建议】
...

【参考修改句】
...

【高分范文】
...

作文词数：${wordCount}

【作文】
${essay}
`;
}

app.post("/score", async (req, res) => {
  const essay = req.body?.essay;

  if (!essay) {
    return res.status(400).send("请输入作文");
  }

  const wordCount = countWords(essay);

  if (wordCount < 30) {
    return res.status(400).send("作文太短");
  }

  const apiKey = process.env.DEEPSEEK_API_KEY;

  const client = new OpenAI({
    baseURL: "https://api.deepseek.com",
    apiKey
  });

  try {
    const cleanedEssay = cleanEssay(essay);
    const prompt = buildPrompt(cleanedEssay, wordCount);

    const completion = await client.chat.completions.create({
      model: "deepseek-chat",
      messages: [
        {
          role: "system",
          content: "你是专业四六级阅卷老师，评分必须稳定、真实。"
        },
        {
          role: "user",
          content: prompt
        }
      ],
      temperature: 0.1,
      stream: true
    });

    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Transfer-Encoding", "chunked");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("Keep-Alive", "timeout=5, max=1000");

    for await (const chunk of completion) {
      const content = chunk.choices?.[0]?.delta?.content;

      if (content) {
        res.write(content);
      } else {
        // 心跳防断
        res.write("");
      }
    }

    res.end();
  } catch (err) {
    console.error(err);
    if (!res.headersSent) {
      res.status(500).send("评分失败");
    } else {
      res.end();
    }
  }
});

app.listen(PORT, "0.0.0.0", () => {
  console.log("Server running on", PORT);
});