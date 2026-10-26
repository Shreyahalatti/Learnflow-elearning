# Learnflow

A small full-stack learning platform for students and instructors. It runs on Node.js 22.13 or newer and uses Node's built-in SQLite module; no package installation is needed.

## Run locally

```sh
npm start
```

Open [http://localhost:3000](http://localhost:3000). The SQLite database is created at `data/learnflow.db`.

## Demo accounts

- Student: `jamie@learnflow.dev` / `learn123`
- Instructor: `alex@learnflow.dev` / `teach123`

New accounts can be created from the sign-in page. Choose a student or instructor role when registering.

## Features

- Browse and search published courses; filter by category.
- Instructors create courses with lessons and optional multiple-choice quizzes.
- Students enroll, read course lessons, record lesson completion, and see course progress.
- Quiz answers are scored on the server, and correct answers are not included in the course response.
- Passwords are stored as scrypt hashes. Authenticated sessions use opaque, hashed tokens in SQLite.

The server is implemented with Node's built-in HTTP and SQLite modules. `npm start` is the only required command.
