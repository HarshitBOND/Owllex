# Admin Panel Access Control

## Overview

The admin panel is located at: `/admin/{NEXT_PUBLIC_ADMIN_PANEL_SECRET_URL}`

For your setup, the full URL is:
```
http://localhost:3000/admin/admin-7k9m2p5q8r3s1t4u9w6x2y5z8a1b4c7
```

## Security Configuration

### How Admin Access Works

1. **Secret URL Validation**: The URL slug must match `NEXT_PUBLIC_ADMIN_PANEL_SECRET_URL` environment variable
2. **Email-Based Access Control**: Only users whose email addresses are in `ADMIN_EMAILS` can access the admin panel
3. **Automatic Redirect**: Unauthorized users are silently redirected to the home page (no "Access Denied" message)

### Current Admin Emails

Currently authorized admins (from `.env.local`):
```
ADMIN_EMAILS=harshitprabhakar858@gmail.com
```

## Granting Admin Access

To give another user access to the admin panel:

1. Open `.env.local` in your project root
2. Update the `ADMIN_EMAILS` variable:
   ```env
   ADMIN_EMAILS=harshitprabhakar858@gmail.com,newadmin@example.com,anotheradmin@example.com
   ```
3. Save the file
4. **No server restart needed** - the admin check reads from environment variables at request time

### Multiple Admins Example

```env
# Single admin (current)
ADMIN_EMAILS=harshitprabhakar858@gmail.com

# Multiple admins (add more with comma separation)
ADMIN_EMAILS=harshitprabhakar858@gmail.com,team@lexvert.com,ops@lexvert.com
```

## Security Best Practices

✅ **What This Implementation Does Right:**
- Only whitelisted emails can access admin panel
- Unauthorized users don't see an "Access Denied" page (can't confirm admin panel exists)
- Secret URL slug adds an additional layer of security
- Admin access is configured in environment variables (not stored in database)
- No self-promotion or "Become Admin" buttons

✅ **Additional Security Measures:**
- The promote-admin endpoint is disabled to prevent unauthorized elevation
- Admin check happens on every request
- User must be signed in with Clerk before any admin check occurs

## How Admin Check Works

When accessing `/admin/{slug}`:

1. **URL Validation**: Check if slug matches `NEXT_PUBLIC_ADMIN_PANEL_SECRET_URL`
   - ❌ Invalid slug? → Show "Invalid Admin URL" page
   
2. **Authentication Check**: Check if user is signed in
   - ❌ Not signed in? → Show "Sign In Required" page
   
3. **Admin Authorization Check**: Call `/api/scraper/admin-check` to verify if user is admin
   - Checks database `User` document `role` field for "admin"
   - **OR** checks if user's email is in `ADMIN_EMAILS` environment variable
   - ❌ Not admin? → Silently redirect to home page
   - ✅ Admin? → Grant access to admin panel

## File Locations

- **Frontend**: [app/admin/[slug]/page.tsx](app/admin/[slug]/page.tsx)
- **API Route**: [app/api/scraper/admin-check/route.ts](app/api/scraper/admin-check/route.ts)
- **Auth Helper**: [app/api/lib/adminAuth.ts](app/api/lib/adminAuth.ts)
- **Configuration**: `.env.local` - `ADMIN_EMAILS` variable

## Monitoring Admin Activity

The admin panel displays:
- PDF scraper statistics
- Processed PDFs with download history
- Extracted cases from PDFs
- Scraper run logs with error tracking

This data helps you:
- Monitor automated scraping tasks
- Debug parsing failures
- Track case extraction progress
- Review historical scraper performance

## Troubleshooting

### "Invalid Admin URL" Error
- Verify you're using the correct secret URL slug: `admin-7k9m2p5q8r3s1t4u9w6x2y5z8a1b4c7`
- Check `.env.local` for `NEXT_PUBLIC_ADMIN_PANEL_SECRET_URL`

### Silent Redirect to Home (Not Admin)
- Your email is not in `ADMIN_EMAILS` in `.env.local`
- Add your email to the comma-separated list
- Ensure you're signed in with the correct email

### "Sign In Required" Error
- You're not signed in to the application
- Click "Sign In" and use your Clerk account
- Ensure your account's email is in `ADMIN_EMAILS`

## Environment Variables

```env
# Admin panel secret URL (required)
NEXT_PUBLIC_ADMIN_PANEL_SECRET_URL=admin-7k9m2p5q8r3s1t4u9w6x2y5z8a1b4c7

# Comma-separated admin emails (required)
ADMIN_EMAILS=harshitprabhakar858@gmail.com

# Same as above for server-side checks
ADMIN_PANEL_SECRET_URL=admin-7k9m2p5q8r3s1t4u9w6x2y5z8a1b4c7
```
