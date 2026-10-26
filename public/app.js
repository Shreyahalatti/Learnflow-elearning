const app = document.querySelector("#app");
const state = { user: null, courses: [], view: "explore", search: "", category: "All", modal: null };
const icons = { explore: "⌕", learning: "▣", teaching: "✎" };
const categories = ["All", "Design", "Development", "Business", "Marketing", "Personal growth"];

function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]);
}

async function api(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { ...(options.body ? { "Content-Type": "application/json" } : {}), ...options.headers }
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "Something went wrong.");
  return payload;
}

function notify(message) {
  document.querySelector(".toast")?.remove();
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = message;
  document.body.append(toast);
  setTimeout(() => toast.remove(), 3000);
}

async function load() {
  try {
    const [identity, catalog] = await Promise.all([api("/api/me"), api("/api/courses")]);
    state.user = identity.user;
    state.courses = catalog.courses;
    if (!state.user) return renderAuth();
    renderApp();
  } catch (error) {
    app.innerHTML = `<div class="loading">${escapeHtml(error.message)}</div>`;
  }
}

function renderAuth(mode = "login", errorMessage = "") {
  const register = mode === "register";
  app.innerHTML = `
    <div class="auth-screen">
      <aside class="auth-aside">
        <a class="brand" href="#"><span class="brand-mark">l.</span><span style="color:#242421">learn</span><span>flow</span></a>
        <div class="auth-quote"><span class="eyebrow">A little learning goes a long way</span><h1>Make room<br>to grow.</h1><p>Learn something new, one thoughtful lesson at a time. Find your people, build your skills, and keep moving forward.</p></div>
        <div class="auth-deco"></div>
      </aside>
      <main class="auth-main"><div class="auth-form">
        <a class="brand auth-brand-mobile" href="#"><span class="brand-mark">l.</span><span style="color:#242421">learn</span><span>flow</span></a>
        <span class="eyebrow">${register ? "Your next chapter starts here" : "Welcome back"}</span>
        <h2>${register ? "Create your account" : "Good to see you again"}</h2>
        <p>${register ? "Join a community built around curious minds." : "Sign in and pick up right where you left off."}</p>
        ${errorMessage ? `<div class="notice">${escapeHtml(errorMessage)}</div>` : ""}
        <form id="auth-form">
          ${register ? `<div class="field"><label for="name">Full name</label><input id="name" name="name" required maxlength="80" placeholder="Your name"></div>` : ""}
          <div class="field"><label for="email">Email address</label><input id="email" name="email" type="email" required autocomplete="email" placeholder="you@example.com"></div>
          <div class="field"><label for="password">Password</label><input id="password" name="password" type="password" required minlength="${register ? 8 : 1}" autocomplete="${register ? "new-password" : "current-password"}" placeholder="${register ? "At least 8 characters" : "Your password"}"></div>
          ${register ? `<div class="field"><label for="role">I’m here as a</label><select id="role" name="role"><option value="student">Student — I want to learn</option><option value="instructor">Instructor — I want to teach</option></select></div>` : ""}
          <button class="button" style="width:100%;margin-top:5px" type="submit">${register ? "Create account" : "Sign in"} <span aria-hidden="true">→</span></button>
        </form>
        <div class="auth-switch">${register ? "Already have an account?" : "New to Learnflow?"} <button type="button" id="auth-toggle">${register ? "Sign in" : "Create an account"}</button></div>
        ${!register ? `<div class="demo-box"><strong>Try a demo account</strong><br>Student: jamie@learnflow.dev / learn123<br>Instructor: alex@learnflow.dev / teach123</div>` : ""}
      </div></main>
    </div>`;
  document.querySelector("#auth-toggle").addEventListener("click", () => renderAuth(register ? "login" : "register"));
  document.querySelector("#auth-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const body = Object.fromEntries(new FormData(event.currentTarget));
    try {
      const result = await api(`/api/auth/${register ? "register" : "login"}`, { method: "POST", body: JSON.stringify(body) });
      state.user = result.user;
      state.view = "explore";
      await refresh();
      notify(`Welcome${register ? " to Learnflow" : " back"}, ${state.user.name.split(" ")[0]}!`);
    } catch (error) {
      renderAuth(mode, error.message);
    }
  });
}

function renderApp() {
  const viewName = state.view === "explore" ? "Explore" : state.view === "learning" ? "My learning" : "Teach";
  const initials = state.user.name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
  app.innerHTML = `
    <div class="shell">
      <aside class="sidebar">
        <a class="brand" href="#" aria-label="Learnflow home"><span class="brand-mark">l.</span><span style="color:#242421">learn</span><span>flow</span></a>
        <div><div class="nav-label">Menu</div><nav class="nav-list">
          <button class="nav-link ${state.view === "explore" ? "active" : ""}" data-view="explore"><span class="nav-icon">${icons.explore}</span>Explore courses</button>
          ${state.user.role === "student" ? `<button class="nav-link ${state.view === "learning" ? "active" : ""}" data-view="learning"><span class="nav-icon">${icons.learning}</span>My learning</button>` : ""}
          ${state.user.role === "instructor" ? `<button class="nav-link ${state.view === "teaching" ? "active" : ""}" data-view="teaching"><span class="nav-icon">${icons.teaching}</span>My courses</button>` : ""}
        </nav></div>
        <div class="sidebar-bottom"><div class="help-card"><strong>A little progress adds up.</strong><p>Come back to your lessons whenever you need a fresh perspective.</p><button class="text-button" data-view="explore">Find something new →</button></div>
          <div class="profile"><div class="avatar">${escapeHtml(initials)}</div><div class="profile-copy"><strong>${escapeHtml(state.user.name)}</strong><span>${escapeHtml(state.user.role)}</span></div><button class="logout" id="logout" title="Sign out" aria-label="Sign out">⇥</button></div>
        </div>
      </aside>
      <main class="main"><header class="topbar"><div class="breadcrumb">Pages <span style="padding:0 7px;color:#c2c2bc">/</span> <strong>${viewName}</strong></div>
        <div class="top-actions"><input class="search" id="search" placeholder="⌕   Search courses..." value="${escapeHtml(state.search)}" aria-label="Search courses"><button class="icon-button" aria-label="Notifications">♧</button></div></header>
        <section class="content" id="content">${renderContent()}</section>
      </main>
    </div>
    <div id="modal-root"></div>`;
  document.querySelectorAll("[data-view]").forEach((button) => button.addEventListener("click", () => {
    state.view = button.dataset.view;
    renderApp();
  }));
  document.querySelector("#logout").addEventListener("click", async () => {
    await api("/api/auth/logout", { method: "POST" });
    state.user = null;
    renderAuth();
  });
  document.querySelector("#search").addEventListener("input", (event) => {
    state.search = event.target.value;
    const cursor = event.target.selectionStart;
    document.querySelector("#content").innerHTML = renderContent();
    event.target === document.activeElement && document.querySelector("#search")?.focus();
    bindContent();
    const nextSearch = document.querySelector("#search");
    if (nextSearch) { nextSearch.value = state.search; nextSearch.setSelectionRange(cursor, cursor); }
  });
  bindContent();
}

function renderContent() {
  if (state.view === "learning") return renderLearning();
  if (state.view === "teaching") return renderTeaching();
  return renderExplore();
}

function matchingCourses(courses) {
  return courses.filter((course) => {
    const matchesSearch = `${course.title} ${course.category} ${course.instructor_name}`.toLowerCase().includes(state.search.toLowerCase());
    return matchesSearch && (state.category === "All" || course.category.toLowerCase() === state.category.toLowerCase());
  });
}

function renderExplore() {
  const courses = matchingCourses(state.courses);
  return `
    <span class="eyebrow">Monday, October 26</span>
    <h1 class="page-title">Make today a little more curious.</h1>
    <p class="subtitle">Good things grow when you give them time. Find a course that sparks something and take the next small step.</p>
    <section class="hero"><div class="hero-copy"><span class="eyebrow">Your learning journey</span><h2>There’s always something<br>new around the corner.</h2><p>A fresh idea, a useful skill, a different point of view. Your next lesson is waiting.</p><button class="button" id="browse-button">Explore all courses&nbsp; →</button></div><div class="hero-art"><div class="art-circle"></div><div class="art-card"><div class="art-dot"></div><div class="art-line"></div><div class="art-line short"></div><div class="art-line"></div></div><div class="art-tag tag-one">✦  Learn at your pace</div><div class="art-tag tag-two">↗  Keep growing</div></div></section>
    <div class="section-heading"><div><h2>Find your next favorite</h2><p>A handpicked place to start learning.</p></div><span class="course-meta">${courses.length} ${courses.length === 1 ? "course" : "courses"}</span></div>
    <div class="filter-row">${categories.map((category) => `<button class="filter-chip ${state.category === category ? "active" : ""}" data-category="${escapeHtml(category)}">${escapeHtml(category)}</button>`).join("")}</div>
    ${courseGrid(courses)}`;
}

function courseGrid(courses, progress = false) {
  if (!courses.length) return `<div class="empty-state"><strong>Nothing here just yet.</strong>Try another search or check back soon.</div>`;
  return `<div class="course-grid">${courses.map((course) => {
    const percent = course.lesson_count ? Math.round(course.completed_count * 100 / course.lesson_count) : 0;
    return `<article class="course-card" data-course="${course.id}" tabindex="0" role="button" aria-label="View ${escapeHtml(course.title)}">
      <div class="course-cover ${escapeHtml(course.color)}"><span class="cover-label">${escapeHtml(course.category)}</span><div class="cover-orb"></div><div class="cover-shape"></div></div>
      <div class="course-info"><div class="course-meta">${escapeHtml(course.level)} <span>·</span> ${escapeHtml(course.duration)}</div>
        <h3>${escapeHtml(course.title)}</h3><div class="instructor">By ${escapeHtml(course.instructor_name)}</div>
        ${progress ? `<div class="progress-track"><div class="progress-fill" style="width:${percent}%"></div></div>` : ""}
        <div class="card-footer"><span>${course.lesson_count} lessons · ${course.student_count} learners</span><span>${progress ? `${percent}% complete` : "View course →"}</span></div>
      </div></article>`;
  }).join("")}</div>`;
}

function renderLearning() {
  const courses = state.courses.filter((course) => course.enrolled);
  const lessonsDone = courses.reduce((total, course) => total + course.completed_count, 0);
  const lessonsTotal = courses.reduce((total, course) => total + course.lesson_count, 0);
  const percent = lessonsTotal ? Math.round(lessonsDone * 100 / lessonsTotal) : 0;
  return `<span class="eyebrow">Your learning space</span><h1 class="page-title">Look how far you’ve come.</h1>
    <p class="subtitle">Every lesson is a small win. Pick up where you left off, or take a moment to appreciate your progress.</p>
    <div class="stats-row"><div class="stat-card"><span>Courses you’re taking</span><strong>${courses.length}</strong></div><div class="stat-card"><span>Lessons completed</span><strong>${lessonsDone}</strong></div><div class="stat-card"><span>Overall progress</span><strong>${percent}%</strong></div></div>
    <div class="section-heading"><div><h2>Your courses</h2><p>Keep building on what you know.</p></div></div>${courseGrid(matchingCourses(courses), true)}`;
}

function renderTeaching() {
  const courses = state.courses.filter((course) => course.instructor_id === state.user.id);
  const students = courses.reduce((total, course) => total + course.student_count, 0);
  return `<span class="eyebrow">Your teaching space</span><h1 class="page-title">Good ideas are worth sharing.</h1>
    <p class="subtitle">Shape a learning experience, share what you know, and help someone else take their next step.</p>
    <div class="instructor-banner"><div><span class="eyebrow">Your classroom</span><h2>Every great course starts somewhere.</h2><p>You’ve welcomed ${students} ${students === 1 ? "learner" : "learners"} into your classroom.</p></div><button class="button" id="create-course">＋ &nbsp;Create a course</button></div>
    <div class="stats-row"><div class="stat-card"><span>Courses published</span><strong>${courses.length}</strong></div><div class="stat-card"><span>Total learners</span><strong>${students}</strong></div><div class="stat-card"><span>Lessons created</span><strong>${courses.reduce((total, course) => total + course.lesson_count, 0)}</strong></div></div>
    <div class="section-heading"><div><h2>Your courses</h2><p>Manage the learning experiences you’ve shared.</p></div><button class="button secondary small" id="create-course-secondary">＋ New course</button></div>${courseGrid(matchingCourses(courses))}`;
}

function bindContent() {
  document.querySelector("#browse-button")?.addEventListener("click", () => document.querySelector(".filter-row")?.scrollIntoView({ behavior: "smooth" }));
  document.querySelectorAll("[data-category]").forEach((button) => button.addEventListener("click", () => {
    state.category = button.dataset.category;
    document.querySelector("#content").innerHTML = renderExplore();
    bindContent();
  }));
  document.querySelectorAll("[data-course]").forEach((card) => {
    const open = () => openCourse(Number(card.dataset.course));
    card.addEventListener("click", open);
    card.addEventListener("keydown", (event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); open(); } });
  });
  document.querySelectorAll("#create-course,#create-course-secondary").forEach((button) => button.addEventListener("click", openCourseBuilder));
}

async function refresh() {
  const result = await api("/api/courses");
  state.courses = result.courses;
  renderApp();
}

async function openCourse(id) {
  try {
    const { course } = await api(`/api/courses/${id}`);
    const isOwner = state.user.role === "instructor" && course.instructor_id === state.user.id;
    const canLearn = state.user.role === "student" && course.enrolled;
    document.querySelector("#modal-root").innerHTML = `<div class="modal-backdrop" id="backdrop"><section class="modal" role="dialog" aria-modal="true" aria-labelledby="course-title">
      <div class="modal-head"><div><span class="eyebrow">${escapeHtml(course.category)} · ${escapeHtml(course.level)}</span><h2 id="course-title">${escapeHtml(course.title)}</h2></div><button class="close-button" id="close-modal" aria-label="Close">×</button></div>
      <p class="modal-description">${escapeHtml(course.description)}</p><div class="course-meta">${escapeHtml(course.duration)} <span>·</span> ${course.lessons.length} lessons <span>·</span> With ${escapeHtml(course.instructor_name)}</div>
      <div class="lesson-list">${course.lessons.map((lesson) => `<article class="lesson-item"><div class="lesson-top"><span class="lesson-number">${lesson.position}</span><span class="lesson-title">${escapeHtml(lesson.title)}</span>${lesson.completed ? `<span class="lesson-check">✓ Done</span>` : ""}</div>
        ${canLearn ? `<div class="lesson-body">${escapeHtml(lesson.content)}${lesson.quiz ? `<div class="quiz-box" data-quiz="${lesson.quiz.id}"><strong>${escapeHtml(lesson.quiz.question)}</strong>${lesson.quiz.options.map((option, index) => `<label class="quiz-option"><input type="radio" name="quiz-${lesson.quiz.id}" value="${index}"> ${escapeHtml(option)}</label>`).join("")}<button class="button small quiz-submit" data-quiz-id="${lesson.quiz.id}">Check answer</button><p class="quiz-feedback" aria-live="polite"></p></div>` : ""}<div class="lesson-actions">${!lesson.completed ? `<button class="button small complete-lesson" data-lesson-id="${lesson.id}">Mark as complete</button>` : `<span class="course-meta">You’ve completed this lesson.</span>`}</div></div>` : ""}</article>`).join("")}</div>
      ${state.user.role === "student" && !course.enrolled ? `<button class="button" id="enroll">Enroll in this course&nbsp; →</button>` : ""}
      ${isOwner ? `<p class="course-meta" style="margin-top:17px">This is one of your courses. Your learners can enroll and make progress here.</p>` : ""}
      ${state.user.role === "instructor" && !isOwner ? `<p class="course-meta" style="margin-top:17px">Sign in as a student to enroll and learn.</p>` : ""}
    </section></div>`;
    document.querySelector("#close-modal").addEventListener("click", closeModal);
    document.querySelector("#backdrop").addEventListener("click", (event) => { if (event.target.id === "backdrop") closeModal(); });
    document.querySelector("#enroll")?.addEventListener("click", async () => {
      try { await api(`/api/courses/${id}/enroll`, { method: "POST" }); await refresh(); openCourse(id); notify("You’re enrolled! Let’s get learning."); }
      catch (error) { notify(error.message); }
    });
    document.querySelectorAll(".complete-lesson").forEach((button) => button.addEventListener("click", async () => {
      try { await api(`/api/lessons/${button.dataset.lessonId}/complete`, { method: "POST" }); await refresh(); openCourse(id); notify("Lesson marked complete. Nice work!"); }
      catch (error) { notify(error.message); }
    }));
    document.querySelectorAll(".quiz-submit").forEach((button) => button.addEventListener("click", async () => {
      const selection = document.querySelector(`input[name="quiz-${button.dataset.quizId}"]:checked`);
      if (!selection) return notify("Choose an answer first.");
      try {
        const result = await api(`/api/quizzes/${button.dataset.quizId}/submit`, { method: "POST", body: JSON.stringify({ answer: Number(selection.value) }) });
        const feedback = button.parentElement.querySelector(".quiz-feedback");
        feedback.textContent = result.correct ? `Correct — you scored ${result.score}%. Well done!` : `Not quite this time — you scored ${result.score}%. Give the lesson another look.`;
      } catch (error) { notify(error.message); }
    }));
  } catch (error) { notify(error.message); }
}

function closeModal() {
  document.querySelector("#modal-root").innerHTML = "";
}

function openCourseBuilder() {
  document.querySelector("#modal-root").innerHTML = `<div class="modal-backdrop" id="backdrop"><section class="modal" role="dialog" aria-modal="true" aria-labelledby="builder-title">
    <div class="modal-head"><div><span class="eyebrow">Share what you know</span><h2 id="builder-title">Create a course</h2></div><button class="close-button" id="close-modal" aria-label="Close">×</button></div>
    <p class="modal-description">Start with the big picture, then add lessons. Each lesson can include an optional quick quiz.</p>
    <form id="course-form"><div class="form-grid">
      <div class="field full"><label for="course-title">Course title</label><input id="course-title" name="title" required maxlength="120" placeholder="e.g. The fundamentals of thoughtful design"></div>
      <div class="field"><label for="course-category">Category</label><select id="course-category" name="category">${categories.filter((category) => category !== "All").map((category) => `<option>${escapeHtml(category)}</option>`).join("")}</select></div>
      <div class="field"><label for="course-level">Level</label><select id="course-level" name="level"><option>Beginner</option><option>Intermediate</option><option>Advanced</option></select></div>
      <div class="field"><label for="course-duration">Estimated duration</label><input id="course-duration" name="duration" maxlength="40" placeholder="e.g. 2h 30m"></div>
      <div class="field"><label for="course-color">Course card color</label><select id="course-color" name="color"><option value="violet">Soft violet</option><option value="blue">Soft blue</option><option value="green">Soft green</option><option value="orange">Warm sand</option></select></div>
      <div class="field full"><label for="course-description">Course description</label><textarea id="course-description" name="description" required maxlength="2000" placeholder="What will your students learn?"></textarea></div>
    </div>
    <div class="section-heading" style="margin-top:14px"><div><h2 style="font-size:15px">Course lessons</h2><p>Add at least one lesson to publish your course.</p></div></div>
    <div id="lesson-builders"></div><button class="button secondary small" type="button" id="add-lesson">＋ Add a lesson</button>
    <div id="form-error" class="notice" style="display:none;margin-top:14px"></div>
    <div style="display:flex;justify-content:flex-end;gap:9px;margin-top:20px"><button class="button secondary" type="button" id="cancel-course">Cancel</button><button class="button" type="submit">Publish course&nbsp; →</button></div>
    </form>
  </section></div>`;
  document.querySelector("#close-modal").addEventListener("click", closeModal);
  document.querySelector("#cancel-course").addEventListener("click", closeModal);
  document.querySelector("#backdrop").addEventListener("click", (event) => { if (event.target.id === "backdrop") closeModal(); });
  const builders = document.querySelector("#lesson-builders");
  let lessonCount = 0;
  const addLesson = () => {
    lessonCount += 1;
    const number = lessonCount;
    const element = document.createElement("div");
    element.className = "lesson-builder";
    element.dataset.lesson = number;
    element.innerHTML = `<h3>Lesson ${number}</h3><div class="field"><label>Lesson title</label><input class="lesson-name" required maxlength="120" placeholder="e.g. Start with the basics"></div>
      <div class="field"><label>Lesson content</label><textarea class="lesson-content" required maxlength="10000" placeholder="Write the lesson content students will read..."></textarea></div>
      <label class="quiz-toggle"><input type="checkbox" class="quiz-enabled"> Add a quiz to this lesson</label>
      <div class="quiz-fields" hidden><div class="field"><label>Quiz question</label><input class="quiz-question" maxlength="500" placeholder="What would you like students to remember?"></div>
        <div class="field"><label>Answer options (one per line; mark the correct one with *)</label><textarea class="quiz-options" placeholder="First answer&#10;*Correct answer&#10;Another answer"></textarea></div></div>`;
    element.querySelector(".quiz-enabled").addEventListener("change", (event) => { element.querySelector(".quiz-fields").hidden = !event.target.checked; });
    builders.append(element);
  };
  addLesson();
  document.querySelector("#add-lesson").addEventListener("click", () => {
    if (lessonCount >= 30) return notify("A course can have up to 30 lessons.");
    addLesson();
  });
  document.querySelector("#course-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const lessons = [...builders.querySelectorAll(".lesson-builder")].map((element) => {
      const lesson = { title: element.querySelector(".lesson-name").value, content: element.querySelector(".lesson-content").value };
      if (element.querySelector(".quiz-enabled").checked) {
        const options = element.querySelector(".quiz-options").value.split("\n").map((option) => option.trim()).filter(Boolean);
        lesson.quiz = {
          question: element.querySelector(".quiz-question").value,
          options: options.map((option) => option.replace(/^\*\s*/, "")),
          correctIndex: options.findIndex((option) => option.startsWith("*"))
        };
      }
      return lesson;
    });
    const body = Object.fromEntries(formData);
    body.lessons = lessons;
    const error = document.querySelector("#form-error");
    try {
      const result = await api("/api/courses", { method: "POST", body: JSON.stringify(body) });
      await refresh();
      state.view = "teaching";
      renderApp();
      notify("Your course is live!");
      openCourse(result.courseId);
    } catch (exception) {
      error.textContent = exception.message;
      error.style.display = "block";
    }
  });
}

load();
