New Havena demo request

{{ $submission->name }} wants a demo
Submitted: {{ optional($submission->created_at)->timezone(config('app.timezone'))->format('M j, Y g:i A') }}

Contact
- Name: {{ $submission->name }}
- Email: {{ $submission->email }}
- Phone: {{ $demo['phone'] ?? 'Not provided' }}

Details
- Community: {{ $submission->community ?: 'Not provided' }}
- Role: {{ $roleLabel }}
- Community size: {{ $demo['community_size'] ?? 'Not provided' }}
- Preferred time: {{ $demo['preferred_time'] ?? 'Not provided' }}

What they want to see
{{ ($demo['note'] ?? '') !== '' ? $demo['note'] : $submission->message }}

Review in admin: {{ $adminUrl }}

Reply to this email to message the requester directly.

— {{ $brandName ?? 'Havena' }}
{{ $tagline ?? 'One trusted place for the whole neighborhood.' }}
{{ $supportEmail ?? 'hello@gohavena.com' }}
