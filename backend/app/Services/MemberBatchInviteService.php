<?php

namespace App\Services;

use App\Support\PhoneNormalizer;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\ValidationException;

class MemberBatchInviteService
{
    public const MAX_ROWS = 200;

    /**
     * @return array{rows: list<array{row: int, name: string, email: string, phone: string, unit: string, residence_type: string, errors: list<string>}>}
     */
    public function inspect(string $contents, ?int $communityId = null): array
    {
        $parsed = $this->parse($contents);
        $rows = [];
        $seenEmails = [];
        $seenPhones = [];

        foreach ($parsed as $entry) {
            $issues = $this->rowIssues($entry, $seenEmails, $seenPhones, $communityId);
            $errors = array_column($issues, 'message');
            $emailKey = strtolower(trim($entry['email']));
            $phone = PhoneNormalizer::accept($entry['phone']);
            if ($emailKey !== '' && ! in_array('Email address is invalid', $errors, true) && ! in_array('Email address is required', $errors, true)) {
                $seenEmails[$emailKey] = true;
            }
            if ($phone) {
                $seenPhones[$phone] = true;
            }

            $rows[] = [
                'row' => $entry['row'],
                'name' => $entry['name'],
                'email' => $entry['email'],
                'phone' => $entry['phone'],
                'unit' => $entry['unit'],
                'residence_type' => $this->canonicalResidence($entry['residence_type']) ?? $entry['residence_type'],
                'errors' => $errors,
                'issues' => $issues,
            ];
        }

        return ['rows' => $rows];
    }

    /**
     * @return list<array{row: int, name: string, email: string, phone: string, unit: string, residence_type: string}>
     */
    private function parse(string $contents): array
    {
        $contents = preg_replace('/^\xEF\xBB\xBF/', '', $contents) ?? $contents;
        $contents = str_replace(["\r\n", "\r"], "\n", $contents);
        if (trim($contents) === '') {
            throw ValidationException::withMessages([
                'file' => ['The file is empty. Download the template and add residents.'],
            ]);
        }

        $handle = fopen('php://temp', 'r+');
        fwrite($handle, $contents);
        rewind($handle);

        $header = fgetcsv($handle);
        if (! is_array($header)) {
            fclose($handle);
            throw ValidationException::withMessages([
                'file' => ['The file does not include the required columns.'],
            ]);
        }

        $map = $this->headerMap($header);
        foreach (['name', 'email', 'phone', 'unit', 'residence_type'] as $required) {
            if (! array_key_exists($required, $map)) {
                fclose($handle);
                throw ValidationException::withMessages([
                    'file' => ['Use the template columns: Name, Email, Phone Number, Unit / Apartment, Residence Type.'],
                ]);
            }
        }

        $rows = [];
        $line = 1;
        while (($data = fgetcsv($handle)) !== false) {
            $line++;
            if ($this->isBlankRow($data)) {
                continue;
            }
            $rows[] = [
                'row' => $line,
                'name' => trim((string) ($data[$map['name']] ?? '')),
                'email' => trim((string) ($data[$map['email']] ?? '')),
                'phone' => trim((string) ($data[$map['phone']] ?? '')),
                'unit' => trim((string) ($data[$map['unit']] ?? '')),
                'residence_type' => trim((string) ($data[$map['residence_type']] ?? '')),
            ];
            if (count($rows) > self::MAX_ROWS) {
                fclose($handle);
                throw ValidationException::withMessages([
                    'file' => ['Upload up to '.self::MAX_ROWS.' residents at a time.'],
                ]);
            }
        }
        fclose($handle);

        if ($rows === []) {
            throw ValidationException::withMessages([
                'file' => ['The file has no resident rows. Add at least one resident under the header.'],
            ]);
        }

        return $rows;
    }

    /** @param list<string|null> $header */
    private function headerMap(array $header): array
    {
        $aliases = [
            'name' => 'name',
            'email' => 'email',
            'phone number' => 'phone',
            'phone' => 'phone',
            'unit / apartment' => 'unit',
            'unit/apartment' => 'unit',
            'unit' => 'unit',
            'residence type' => 'residence_type',
            'residence' => 'residence_type',
        ];

        $map = [];
        foreach ($header as $index => $label) {
            $key = strtolower(trim((string) $label));
            if (isset($aliases[$key])) {
                $map[$aliases[$key]] = $index;
            }
        }

        return $map;
    }

    /** @param list<string|null> $data */
    private function isBlankRow(array $data): bool
    {
        foreach ($data as $value) {
            if (trim((string) $value) !== '') {
                return false;
            }
        }

        return true;
    }

    /**
     * @param array{row: int, name: string, email: string, phone: string, unit: string, residence_type: string} $entry
     * @param array<string, true> $seenEmails
     * @param array<string, true> $seenPhones
     * @return list<array{field: string, message: string}>
     */
    private function rowIssues(array $entry, array $seenEmails, array $seenPhones, ?int $communityId = null): array
    {
        $issues = [];
        $add = function (string $field, string $message) use (&$issues): void {
            $issues[] = ['field' => $field, 'message' => $message];
        };

        if ($entry['name'] === '') {
            $add('Name', 'Name is required');
        } elseif (mb_strlen($entry['name']) > 25 || ! preg_match('/^[\p{L} .]+$/u', $entry['name'])) {
            $add('Name', 'Full Name can only contain letters, spaces, and full stops, with a maximum of 25 characters.');
        }

        if ($entry['email'] === '') {
            $add('Email', 'Email address is required');
        } elseif (Validator::make(['email' => $entry['email']], ['email' => 'required|email'])->fails()) {
            $add('Email', 'Email address is invalid');
        } elseif (isset($seenEmails[strtolower($entry['email'])])) {
            $add('Email', 'Email already exists');
        }

        $phone = null;
        if ($entry['phone'] === '') {
            $add('Phone Number', 'Phone number is required');
        } else {
            $phone = PhoneNormalizer::accept($entry['phone']);
            if (! $phone) {
                $add('Phone Number', 'Phone number is invalid');
            } elseif (isset($seenPhones[$phone])) {
                $add('Phone Number', 'Phone number already exists');
            }
        }

        if ($entry['unit'] === '') {
            $add('Unit / Apartment', 'Unit / Apartment is required');
        } elseif (strlen($entry['unit']) > 20 || ! preg_match('/^[A-Za-z0-9 \/\\-]{1,20}$/', $entry['unit'])) {
            $add('Unit / Apartment', 'Please enter a valid Unit / Apartment number.');
        }

        if ($entry['residence_type'] === '') {
            $add('Residence Type', 'Residence Type is required');
        } elseif ($this->canonicalResidence($entry['residence_type']) === null) {
            $add('Residence Type', 'Residence Type is not valid');
        }

        if ($issues === [] && $phone) {
            $existingByEmail = ContactIdentityService::findUserByEmail($entry['email']);
            $existingByPhone = ContactIdentityService::findOccupyingUserByPhone($phone);

            if ($existingByEmail && $existingByPhone && (int) $existingByEmail->id !== (int) $existingByPhone->id) {
                $add('Phone Number', 'Phone number already exists');

                return $issues;
            }

            $existingUser = $existingByEmail ?: $existingByPhone;
            $inactiveInCommunity = $communityId && $existingUser
                ? \Illuminate\Support\Facades\DB::table('community_memberships')
                    ->where('user_id', $existingUser->id)
                    ->where('community_id', $communityId)
                    ->where('status', 'inactive')
                    ->exists()
                : false;

            $canInviteExistingResident = $communityId
                && $existingUser
                && ! $existingUser->trashed()
                && ($existingUser->role ?? '') === 'resident'
                && ! $inactiveInCommunity
                && ! \Illuminate\Support\Facades\DB::table('community_memberships')
                    ->where('user_id', $existingUser->id)
                    ->where('community_id', $communityId)
                    ->whereIn('status', ['approved', 'pending', 'banned', 'not_invited'])
                    ->exists();

            if ($canInviteExistingResident) {
                return $issues;
            }

            try {
                if ($inactiveInCommunity) {
                    ContactIdentityService::assertAvailableForRegistration(
                        null,
                        $phone,
                        (int) $existingUser->id,
                    );
                } else {
                    ContactIdentityService::assertAvailableForRegistration($entry['email'], $phone);
                }
            } catch (ValidationException $e) {
                $flat = strtolower(implode(' ', collect($e->errors())->flatten()->all()));
                if (! $inactiveInCommunity && str_contains($flat, 'email')) {
                    $add('Email', 'Email already exists');
                }
                if (str_contains($flat, 'phone')) {
                    $add('Phone Number', 'Phone number already exists');
                }
                if ($issues === [] && ! $inactiveInCommunity) {
                    $add('Email', 'Email already exists');
                }
            } catch (\Illuminate\Http\Exceptions\HttpResponseException $e) {
                $payload = $e->getResponse()->getData(true);
                $message = strtolower((string) ($payload['message'] ?? ''));
                if (str_contains($message, 'email')) {
                    $add('Email', 'Email already exists');
                }
                if (str_contains($message, 'phone')) {
                    $add('Phone Number', 'Phone number already exists');
                }
            }
        }

        return $issues;
    }

    private function canonicalResidence(string $value): ?string
    {
        $key = strtolower(trim($value));

        return match ($key) {
            'homeowner', 'home owner' => 'homeowner',
            'tenant' => 'tenant',
            default => null,
        };
    }
}
