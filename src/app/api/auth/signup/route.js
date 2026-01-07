import { createClient } from '@supabase/supabase-js';
import bcrypt from 'bcryptjs';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.warn('Supabase credentials not configured. User signup will not work.');
}

const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

export async function POST(request) {
  try {
    const { email, password, name } = await request.json();

    // Validation
    if (!email || !password) {
      return Response.json({ error: 'Email and password are required' }, { status: 400 });
    }

    if (password.length < 6) {
      return Response.json({ error: 'Password must be at least 6 characters' }, { status: 400 });
    }

    // Check if Supabase is configured
    if (!supabase) {
      return Response.json(
        { error: 'Database not configured. Please set up Supabase credentials.' },
        { status: 500 }
      );
    }

    // Check if user already exists
    const { data: existingUser, error: checkError } = await supabase
      .from('users')
      .select('email')
      .eq('email', email.toLowerCase())
      .maybeSingle();

    // If error is not "not found" (which is fine), return error
    if (checkError && checkError.code !== 'PGRST116') {
      console.error('Error checking existing user:', checkError);
      return Response.json(
        { 
          error: 'Database error. Please check if the users table exists.',
          details: checkError.message 
        },
        { status: 500 }
      );
    }

    if (existingUser) {
      return Response.json({ error: 'User with this email already exists' }, { status: 400 });
    }

    // Hash password
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    // Insert user into database
    const { data, error } = await supabase
      .from('users')
      .insert([
        {
          email: email.toLowerCase(),
          password_hash: passwordHash,
          name: name || email.split('@')[0],
        },
      ])
      .select()
      .single();

    if (error) {
      console.error('Supabase insert error:', error);
      // Provide more specific error messages
      if (error.code === '42P01') {
        return Response.json(
          { 
            error: 'Database table not found. Please run the SQL script to create the users table.',
            details: 'The users table does not exist in your Supabase database.'
          },
          { status: 500 }
        );
      }
      if (error.code === '23505') {
        return Response.json({ error: 'User with this email already exists' }, { status: 400 });
      }
      return Response.json(
        { 
          error: 'Failed to create user account',
          details: error.message || 'Unknown database error'
        },
        { status: 500 }
      );
    }

    // Don't return password hash
    const { password_hash, ...userWithoutPassword } = data;

    return Response.json(
      {
        success: true,
        user: userWithoutPassword,
        message: 'Account created successfully',
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Signup error:', error);
    return Response.json({ error: 'An error occurred during signup' }, { status: 500 });
  }
}

