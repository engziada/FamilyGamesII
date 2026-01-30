# Production Deployment Guide

## Pre-Deployment Checklist

### 1. Environment Setup

Create a `.env` file in the project root (copy from `.env.example`):

```bash
cp .env.example .env
```

Edit `.env` and set:

```env
# Generate a strong secret key
SECRET_KEY=<run: python -c "import secrets; print(secrets.token_hex(32))">

# Your Groq API key from https://console.groq.com/
GROQ_API_KEY=your_actual_groq_api_key_here
```

### 2. Install Dependencies

```bash
# Activate virtual environment
.venv\Scripts\activate  # Windows
source .venv/bin/activate  # Linux/Mac

# Install dependencies
uv pip install -r requirements.txt
```

### 3. Database Setup

The application will automatically create `game_data.db` on first run. Ensure the directory is writable.

### 4. Security Checklist

- [ ] Changed `SECRET_KEY` from default value
- [ ] Set `GROQ_API_KEY` in `.env`
- [ ] `.env` file is in `.gitignore`
- [ ] Database file is in `.gitignore`
- [ ] Log directory is in `.gitignore`

---

## Production Deployment Options

### Option 1: Gunicorn (Recommended for Linux)

```bash
gunicorn --worker-class eventlet -w 1 --bind 0.0.0.0:5000 app:app
```

### Option 2: Direct Flask (Development/Testing Only)

```bash
python app.py
```

**Note:** Not recommended for production. Use Gunicorn or similar WSGI server.

### Option 3: Docker (Coming Soon)

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `SECRET_KEY` | Yes | Flask secret key for session encryption |
| `GROQ_API_KEY` | Yes | Groq API key for trivia translation |
| `FLASK_ENV` | No | Set to `production` for production mode |

---

## Monitoring & Logs

- Application logs: `Log/app.log`
- Log rotation: Not implemented (consider adding for production)
- Error tracking: Console output + log file

---

## Performance Considerations

1. **WebSocket Connections**: Uses eventlet for async I/O
2. **Session Storage**: In-memory (consider Redis for multi-server setup)
3. **Database**: SQLite (consider PostgreSQL for high traffic)
4. **Static Files**: Serve via Nginx/Apache in production

---

## Scaling Recommendations

For high traffic:
1. Use Redis for session storage
2. Use PostgreSQL instead of SQLite
3. Deploy behind Nginx reverse proxy
4. Use multiple Gunicorn workers with sticky sessions
5. Implement rate limiting

---

## Backup Strategy

1. **Database**: Backup `game_data.db` regularly
2. **Logs**: Archive `Log/` directory periodically
3. **Environment**: Keep `.env.example` updated

---

## Troubleshooting

### Issue: WebSocket connection fails
- Check firewall settings
- Ensure port 5000 is accessible
- Verify CORS settings in `app.py`

### Issue: Session data lost
- Check `SECRET_KEY` is consistent
- Verify session cookie settings
- Check browser cookie settings

### Issue: Groq API errors
- Verify `GROQ_API_KEY` is valid
- Check API rate limits
- Review logs for specific error messages

---

## Security Best Practices

1. **HTTPS**: Always use HTTPS in production
2. **Firewall**: Restrict access to necessary ports only
3. **Updates**: Keep dependencies updated regularly
4. **Secrets**: Never commit `.env` to version control
5. **Validation**: All user inputs are validated server-side

---

## Support

For issues or questions:
- Check logs in `Log/app.log`
- Review error messages in browser console
- Check GitHub issues (if applicable)
