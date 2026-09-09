<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class TransactionalEmailSend extends Model
{
    protected $fillable = [
        'mail_type',
        'context_key',
        'recipient_email',
        'sent_at',
    ];

    protected function casts(): array
    {
        return [
            'sent_at' => 'datetime',
        ];
    }
}
