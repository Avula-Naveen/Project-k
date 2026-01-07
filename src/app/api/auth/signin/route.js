import { createClient } from '@supabase/supabase-js';
import bcrypt from 'bcryptjs';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.warn('Supabase credentials not configured. User signin will not work.');
}

const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

export async function POST(request) {
  try {
    const { email, password } = await request.json();

    // Validation
    if (!email || !password) {
      return Response.json({ error: 'Email and password are required' }, { status: 400 });
    }

    // Check if Supabase is configured
    if (!supabase) {
      return Response.json(
        { error: 'Database not configured. Please set up Supabase credentials.' },
        { status: 500 }
      );
    }

    // Find user by email
    const { data: user, error: fetchError } = await supabase
      .from('users')
      .select('*')
      .eq('email', email.toLowerCase())
      .single();

    if (fetchError || !user) {
      return Response.json({ error: 'Invalid email or password' }, { status: 401 });
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.password_hash);

    if (!isPasswordValid) {
      return Response.json({ error: 'Invalid email or password' }, { status: 401 });
    }

    // Update last_login timestamp
    await supabase
      .from('users')
      .update({ last_login: new Date().toISOString() })
      .eq('id', user.id);

    // Don't return password hash
    const { password_hash, ...userWithoutPassword } = user;

    return Response.json(
      {
        success: true,
        user: userWithoutPassword,
        message: 'Sign in successful',
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Signin error:', error);
    return Response.json({ error: 'An error occurred during sign in' }, { status: 500 });
  }
}

