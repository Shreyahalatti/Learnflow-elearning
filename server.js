const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { promisify } = require("node:util");
const { DatabaseSync } = require("node:sqlite");

const scrypt = promisify(crypto.scrypt);
const root = __dirname;
const publicDir = path.join(root, "public");
const dataDir = path.join(root, "data");
fs.mkdirSync(dataDir, { recursive: true });

const db = new DatabaseSync(path.join(dataDir, "learnflow.db"));
db.exec(`
  PRAGMA foreign_keys = ON;
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('student', 'instructor')),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS courses (
    id INTEGER PRIMARY KEY,
    instructor_id INTEGER NOT NULL REFERENCES users(id),
    title TEXT NOT NULL,
    category TEXT NOT NULL,
    description TEXT NOT NULL,
    level TEXT NOT NULL DEFAULT 'Beginner',
    duration TEXT NOT NULL DEFAULT '2 hours',
    color TEXT NOT NULL DEFAULT 'violet',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS lessons (
    id INTEGER PRIMARY KEY,
    course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    position INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS quizzes (
    id INTEGER PRIMARY KEY,
    lesson_id INTEGER NOT NULL UNIQUE REFERENCES lessons(id) ON DELETE CASCADE,
    question TEXT NOT NULL,
    options TEXT NOT NULL,
    correct_index INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS enrollments (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    enrolled_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, course_id)
  );
  CREATE TABLE IF NOT EXISTS lesson_progress (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    lesson_id INTEGER NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
    completed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, lesson_id)
  );
  CREATE TABLE IF NOT EXISTS quiz_attempts (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    quiz_id INTEGER NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
    selected_index INTEGER NOT NULL,
    score INTEGER NOT NULL,
    attempted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`);

const seedUser = (name, email, password, role) => {
  const existing = db.prepare("SELECT id FROM users WHERE email = ?").get(email);
  if (existing) return existing.id;
  const hash = crypto.scryptSync(password, "learnflow-demo-salt", 64).toString("hex");
  return Number(db.prepare(
    "INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)"
  ).run(name, email, hash, role).lastInsertRowid);
};

const instructorId = seedUser("Alex Morgan", "alex@learnflow.dev", "teach123", "instructor");
const studentId = seedUser("Jamie Chen", "jamie@learnflow.dev", "learn123", "student");
if (!db.prepare("SELECT id FROM courses LIMIT 1").get()) {
  const courseId = Number(db.prepare(`
    INSERT INTO courses (instructor_id, title, category, description, level, duration, color)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    instructorId,
    "The Art of Product Design",
    "Design",
    "Learn to turn thoughtful research into intuitive digital experiences. Build a practical design process from the first sketch to a polished prototype.",
    "Beginner",
    "4h 20m",
    "violet"
  ).lastInsertRowid);
  const lesson = db.prepare(
    "INSERT INTO lessons (course_id, title, content, position) VALUES (?, ?, ?, ?)"
  );
  const lessonId = Number(lesson.run(
    courseId,
    "Start with the problem",
    "Great products start with a real human need, not a feature list. In this lesson, we’ll learn how to frame a design challenge, identify the people affected, and ask better questions before reaching for solutions.\n\nBegin by writing down what you know, what you assume, and what you still need to discover. The gap between those lists is where your research begins.",
    1
  ).lastInsertRowid);
  db.prepare("INSERT INTO quizzes (lesson_id, question, options, correct_index) VALUES (?, ?, ?, ?)").run(
    lessonId,
    "What should a thoughtful product design process begin with?",
    JSON.stringify(["A list of features", "A real human need", "A polished prototype", "A color palette"]),
    1
  );
  lesson.run(
    courseId,
    "Listen before you sketch",
    "Research helps you understand how people behave today and what makes their experience difficult. Combine open-ended interviews with observation: ask people to show you how they work, then listen for the workarounds they have created.\n\nKeep your questions neutral. Instead of asking whether someone likes an idea, ask them to describe the last time they encountered the problem.",
    2
  );
}
const sampleCourse = db.prepare("SELECT id FROM courses WHERE title = ? LIMIT 1").get("The Art of Product Design");
if (sampleCourse) {
  db.prepare("INSERT OR IGNORE INTO enrollments (user_id, course_id) VALUES (?, ?)").run(studentId, sampleCourse.id);
  const firstLesson = db.prepare("SELECT id FROM lessons WHERE course_id = ? ORDER BY position LIMIT 1").get(sampleCourse.id);
  if (firstLesson) {
    db.prepare("INSERT OR IGNORE INTO lesson_progress (user_id, lesson_id) VALUES (?, ?)").run(studentId, firstLesson.id);
  }
}

const json = (res, status, payload) => {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff"
  });
  res.end(JSON.stringify(payload));
};

const readBody = (req) => new Promise((resolve, reject) => {
  let raw = "";
  req.on("data", (chunk) => {
    raw += chunk;
    if (raw.length > 1_000_000) {
      reject(Object.assign(new Error("Request body is too large."), { status: 413 }));
      req.destroy();
    }
  });
  req.on("end", () => {
    if (!raw) return resolve({});
    try {
      resolve(JSON.parse(raw));
    } catch {
      reject(Object.assign(new Error("Request body must be valid JSON."), { status: 400 }));
    }
  });
  req.on("error", reject);
});

const parseCookies = (header = "") => Object.fromEntries(
  header.split(";").map((part) => part.trim().split(/=(.*)/s).slice(0, 2))
);

const getUser = (req) => {
  const token = parseCookies(req.headers.cookie).learnflow_session;
  if (!token) return null;
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  const row = db.prepare(`
    SELECT users.id, users.name, users.email, users.role
    FROM sessions JOIN users ON users.id = sessions.user_id
    WHERE sessions.token_hash = ? AND sessions.expires_at > ?
  `).get(tokenHash, Date.now());
  return row || null;
};

const requireUser = (user, role) => {
  if (!user) throw Object.assign(new Error("Please sign in to continue."), { status: 401 });
  if (role && user.role !== role) {
    throw Object.assign(new Error(`This action is only available to ${role}s.`), { status: 403 });
  }
};

const validText = (value, max = 4000) =>
  typeof value === "string" && value.trim().length > 0 && value.trim().length <= max;

const courseSummary = (userId = 0) => db.prepare(`
  SELECT courses.id, courses.title, courses.category, courses.description, courses.level,
         courses.duration, courses.color, courses.instructor_id,
         users.name AS instructor_name,
         (SELECT COUNT(*) FROM lessons WHERE lessons.course_id = courses.id) AS lesson_count,
         (SELECT COUNT(*) FROM enrollments WHERE enrollments.course_id = courses.id) AS student_count,
         EXISTS(SELECT 1 FROM enrollments WHERE enrollments.course_id = courses.id AND user_id = ?) AS enrolled,
         (SELECT COUNT(*) FROM lesson_progress
          JOIN lessons ON lessons.id = lesson_progress.lesson_id
          WHERE lessons.course_id = courses.id AND lesson_progress.user_id = ?) AS completed_count
  FROM courses JOIN users ON users.id = courses.instructor_id
  ORDER BY courses.created_at DESC, courses.id DESC
`);

const sendFile = (res, filePath) => {
  const types = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8" };
  fs.readFile(filePath, (error, contents) => {
    if (error) return json(res, 404, { error: "Page not found." });
    res.writeHead(200, { "Content-Type": types[path.extname(filePath)] || "application/octet-stream", "X-Content-Type-Options": "nosniff" });
    res.end(contents);
  });
};

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const user = getUser(req);
  try {
    if (req.method === "GET" && url.pathname === "/api/me") {
      return json(res, 200, { user });
    }
    if (req.method === "POST" && url.pathname === "/api/auth/register") {
      const body = await readBody(req);
      const name = typeof body.name === "string" ? body.name.trim() : "";
      const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
      if (!validText(name, 80) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
          typeof body.password !== "string" || body.password.length < 8 || body.password.length > 200 ||
          !["student", "instructor"].includes(body.role)) {
        return json(res, 400, { error: "Enter a name, valid email, password of at least 8 characters, and a role." });
      }
      const salt = crypto.randomBytes(16).toString("hex");
      const passwordHash = `${salt}:${(await scrypt(body.password, salt, 64)).toString("hex")}`;
      let userId;
      try {
        userId = Number(db.prepare(
          "INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)"
        ).run(name, email, passwordHash, body.role).lastInsertRowid);
      } catch (error) {
        if (error.code === "ERR_SQLITE_ERROR" && error.message.includes("UNIQUE")) {
          return json(res, 409, { error: "An account with that email already exists." });
        }
        throw error;
      }
      const token = crypto.randomBytes(32).toString("hex");
      db.prepare("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)").run(
        crypto.createHash("sha256").update(token).digest("hex"), userId, Date.now() + 30 * 86400000
      );
      res.setHeader("Set-Cookie", `learnflow_session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=2592000`);
      return json(res, 201, { user: db.prepare("SELECT id, name, email, role FROM users WHERE id = ?").get(userId) });
    }
    if (req.method === "POST" && url.pathname === "/api/auth/login") {
      const body = await readBody(req);
      const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
      const account = db.prepare("SELECT * FROM users WHERE email = ?").get(email);
      let matched = false;
      if (account && typeof body.password === "string") {
        const [salt, storedHash] = account.password_hash.includes(":")
          ? account.password_hash.split(":")
          : ["learnflow-demo-salt", account.password_hash];
        const candidate = await scrypt(body.password, salt, 64);
        matched = crypto.timingSafeEqual(candidate, Buffer.from(storedHash, "hex"));
      }
      if (!matched) return json(res, 401, { error: "That email and password combination wasn’t recognized." });
      const token = crypto.randomBytes(32).toString("hex");
      db.prepare("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)").run(
        crypto.createHash("sha256").update(token).digest("hex"), account.id, Date.now() + 30 * 86400000
      );
      res.setHeader("Set-Cookie", `learnflow_session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=2592000`);
      return json(res, 200, { user: { id: account.id, name: account.name, email: account.email, role: account.role } });
    }
    if (req.method === "POST" && url.pathname === "/api/auth/logout") {
      const token = parseCookies(req.headers.cookie).learnflow_session;
      if (token) db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(
        crypto.createHash("sha256").update(token).digest("hex")
      );
      res.setHeader("Set-Cookie", "learnflow_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0");
      return json(res, 200, { user: null });
    }
    if (req.method === "GET" && url.pathname === "/api/courses") {
      const courses = courseSummary(user?.id || 0).all(user?.id || 0, user?.id || 0);
      return json(res, 200, { courses });
    }
    const courseMatch = url.pathname.match(/^\/api\/courses\/(\d+)$/);
    if (req.method === "GET" && courseMatch) {
      const selected = db.prepare(`
        SELECT courses.*, users.name AS instructor_name
        FROM courses JOIN users ON users.id = courses.instructor_id WHERE courses.id = ?
      `).get(Number(courseMatch[1]));
      if (!selected) return json(res, 404, { error: "Course not found." });
      const enrolled = Boolean(db.prepare("SELECT 1 FROM enrollments WHERE user_id = ? AND course_id = ?").get(user?.id || 0, selected.id));
      const lessons = db.prepare(`
        SELECT lessons.id, lessons.title, lessons.content, lessons.position,
               quizzes.id AS quiz_id, quizzes.question, quizzes.options,
               EXISTS(SELECT 1 FROM lesson_progress WHERE lesson_id = lessons.id AND user_id = ?) AS completed
        FROM lessons LEFT JOIN quizzes ON quizzes.lesson_id = lessons.id
        WHERE lessons.course_id = ? ORDER BY lessons.position
      `).all(user?.id || 0, selected.id).map((lesson) => ({
        ...lesson,
        options: lesson.options ? JSON.parse(lesson.options) : [],
        quiz: lesson.quiz_id ? { id: lesson.quiz_id, question: lesson.question, options: JSON.parse(lesson.options) } : null
      }));
      const progress = courseSummary(user?.id || 0).all(user?.id || 0, user?.id || 0)
        .find((item) => item.id === selected.id);
      return json(res, 200, { course: { ...selected, enrolled, progress, lessons } });
    }
    if (req.method === "POST" && url.pathname === "/api/courses") {
      requireUser(user, "instructor");
      const body = await readBody(req);
      const lessons = body.lessons;
      if (!validText(body.title, 120) || !validText(body.category, 50) ||
          !validText(body.description, 2000) || !Array.isArray(lessons) ||
          lessons.length < 1 || lessons.length > 30) {
        return json(res, 400, { error: "Add a title, category, description, and between 1 and 30 lessons." });
      }
      for (const lesson of lessons) {
        if (!validText(lesson.title, 120) || !validText(lesson.content, 10000)) {
          return json(res, 400, { error: "Every lesson needs a title and lesson content." });
        }
        if (lesson.quiz && (!validText(lesson.quiz.question, 500) ||
            !Array.isArray(lesson.quiz.options) || lesson.quiz.options.length < 2 ||
            lesson.quiz.options.length > 6 || lesson.quiz.options.some((option) => !validText(option, 160)) ||
            !Number.isInteger(lesson.quiz.correctIndex) || lesson.quiz.correctIndex < 0 ||
            lesson.quiz.correctIndex >= lesson.quiz.options.length)) {
          return json(res, 400, { error: "Each quiz needs a question, 2–6 answer options, and a valid correct answer." });
        }
      }
      const createCourse = db.prepare(`
        INSERT INTO courses (instructor_id, title, category, description, level, duration, color)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
      const createLesson = db.prepare("INSERT INTO lessons (course_id, title, content, position) VALUES (?, ?, ?, ?)");
      const createQuiz = db.prepare("INSERT INTO quizzes (lesson_id, question, options, correct_index) VALUES (?, ?, ?, ?)");
      const transaction = () => {
        db.exec("BEGIN");
        try {
        const id = Number(createCourse.run(user.id, body.title.trim(), body.category.trim(), body.description.trim(),
          validText(body.level, 40) ? body.level.trim() : "Beginner",
          validText(body.duration, 40) ? body.duration.trim() : `${lessons.length * 20} min`,
          ["violet", "blue", "green", "orange"].includes(body.color) ? body.color : "violet").lastInsertRowid);
        lessons.forEach((lesson, index) => {
          const lessonId = Number(createLesson.run(id, lesson.title.trim(), lesson.content.trim(), index + 1).lastInsertRowid);
          if (lesson.quiz) createQuiz.run(lessonId, lesson.quiz.question.trim(), JSON.stringify(lesson.quiz.options.map((option) => option.trim())), lesson.quiz.correctIndex);
        });
        db.exec("COMMIT");
        return id;
        } catch (error) {
          db.exec("ROLLBACK");
          throw error;
        }
      };
      return json(res, 201, { courseId: transaction() });
    }
    const enrollMatch = url.pathname.match(/^\/api\/courses\/(\d+)\/enroll$/);
    if (req.method === "POST" && enrollMatch) {
      requireUser(user, "student");
      const courseId = Number(enrollMatch[1]);
      if (!db.prepare("SELECT 1 FROM courses WHERE id = ?").get(courseId)) return json(res, 404, { error: "Course not found." });
      db.prepare("INSERT OR IGNORE INTO enrollments (user_id, course_id) VALUES (?, ?)").run(user.id, courseId);
      return json(res, 201, { enrolled: true });
    }
    const completeMatch = url.pathname.match(/^\/api\/lessons\/(\d+)\/complete$/);
    if (req.method === "POST" && completeMatch) {
      requireUser(user, "student");
      const lessonId = Number(completeMatch[1]);
      const lesson = db.prepare("SELECT course_id FROM lessons WHERE id = ?").get(lessonId);
      if (!lesson) return json(res, 404, { error: "Lesson not found." });
      if (!db.prepare("SELECT 1 FROM enrollments WHERE user_id = ? AND course_id = ?").get(user.id, lesson.course_id)) {
        return json(res, 403, { error: "Enroll in this course before tracking lesson progress." });
      }
      db.prepare("INSERT OR IGNORE INTO lesson_progress (user_id, lesson_id) VALUES (?, ?)").run(user.id, lessonId);
      return json(res, 200, { completed: true });
    }
    const quizMatch = url.pathname.match(/^\/api\/quizzes\/(\d+)\/submit$/);
    if (req.method === "POST" && quizMatch) {
      requireUser(user, "student");
      const body = await readBody(req);
      if (!Number.isInteger(body.answer)) return json(res, 400, { error: "Select an answer before submitting." });
      const quiz = db.prepare(`
        SELECT quizzes.id, quizzes.correct_index, lessons.id AS lesson_id, lessons.course_id
        FROM quizzes JOIN lessons ON lessons.id = quizzes.lesson_id WHERE quizzes.id = ?
      `).get(Number(quizMatch[1]));
      if (!quiz) return json(res, 404, { error: "Quiz not found." });
      if (!db.prepare("SELECT 1 FROM enrollments WHERE user_id = ? AND course_id = ?").get(user.id, quiz.course_id)) {
        return json(res, 403, { error: "Enroll in this course before taking its quizzes." });
      }
      const optionCount = JSON.parse(db.prepare("SELECT options FROM quizzes WHERE id = ?").get(quiz.id).options).length;
      if (body.answer < 0 || body.answer >= optionCount) return json(res, 400, { error: "That answer is not available." });
      const score = body.answer === quiz.correct_index ? 100 : 0;
      db.prepare("INSERT INTO quiz_attempts (user_id, quiz_id, selected_index, score) VALUES (?, ?, ?, ?)").run(
        user.id, quiz.id, body.answer, score
      );
      return json(res, 200, { score, correct: score === 100 });
    }
    if (url.pathname.startsWith("/api/")) return json(res, 404, { error: "API endpoint not found." });
    const requested = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname);
    const filePath = path.resolve(publicDir, `.${requested}`);
    if (!filePath.startsWith(`${publicDir}${path.sep}`)) return json(res, 403, { error: "Forbidden." });
    return sendFile(res, filePath);
  } catch (error) {
    if (error.status) return json(res, error.status, { error: error.message });
    console.error(error);
    return json(res, 500, { error: "Something went wrong. Please try again." });
  }
});

const port = Number(process.env.PORT || 3000);
server.listen(port, () => {
  console.log(`Learnflow is ready at http://localhost:${port}`);
  console.log("Demo accounts: alex@learnflow.dev / teach123 (instructor), jamie@learnflow.dev / learn123 (student)");
});
