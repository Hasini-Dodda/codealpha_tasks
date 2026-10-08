# CodeAlpha Full Stack Development Tasks

Two full-stack projects built for the CodeAlpha internship (October batch).

| Task | Folder | Port | Features |
|------|--------|------|----------|
| 1. Simple E-commerce Store | `task1-ecommerce` | 3000 | Product listing & search, product details page, shopping cart, order processing, user registration/login |
| 2. Social Media Platform | `task2-social` | 4000 | User profiles, posts, comments, like system, follow system |

**Stack:** HTML, CSS, JavaScript (frontend) · Node.js + Express.js (backend) · SQLite (database) · JWT + bcrypt (authentication)

## Run a project
Requires Node.js 18+.

```bash
cd task1-ecommerce      # or task2-social
npm install
npm start
```
Open http://localhost:3000 (Task 1) or http://localhost:4000 (Task 2).
The SQLite database file is created automatically on first run. Task 1 seeds 8 sample products.

## API overview

**Task 1** — `POST /api/register`, `POST /api/login`, `GET /api/products?q=`, `GET /api/products/:id`, `POST /api/orders` (auth), `GET /api/orders` (auth)

**Task 2** — `POST /api/register`, `POST /api/login`, `GET /api/posts?scope=all|following`, `POST /api/posts`, `DELETE /api/posts/:id`, `POST /api/posts/:id/like`, `GET|POST /api/posts/:id/comments`, `GET /api/users/:username`, `POST /api/users/:username/follow`, `PUT /api/me`

## Database
- **Task 1:** users, products, orders, order_items
- **Task 2:** users, posts, comments, likes, follows

## Security notes
Passwords hashed with bcrypt, JWT auth, parameterized SQL queries, HTML-escaped output. Set `JWT_SECRET` as an environment variable in production.
