<?php

namespace App\Support;

class ContentFieldRules
{
    /**
     * @return array<string, mixed>
     */
    public static function rules(bool $required = true): array
    {
        $presence = $required ? 'required' : 'sometimes';

        return [
            'title' => [$presence, 'required', 'string', 'min:3', 'max:200', 'regex:/\p{L}/u'],
            'description' => [$presence, 'required', 'string', 'min:10', 'max:5000'],
        ];
    }

    /**
     * @return array<string, string>
     */
    public static function messages(): array
    {
        return [
            'title.required' => 'Title is required.',
            'title.min' => 'Title must be at least 3 characters.',
            'title.max' => 'Title must be 200 characters or less.',
            'title.regex' => 'Title must include at least one letter.',
            'description.required' => 'Description is required.',
            'description.min' => 'Description must be at least 10 characters.',
            'description.max' => 'Description must be 5000 characters or less.',
        ];
    }
}
