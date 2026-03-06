import prisma from './src/config/database';
import { registerUser, verifyPendingUserEmail, addPhoneToPendingUser, verifyPendingUserPhone } from './src/services/auth.service';

function nowTag() {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}${String(d.getHours()).padStart(2,'0')}${String(d.getMinutes()).padStart(2,'0')}${String(d.getSeconds()).padStart(2,'0')}`;
}

async function run() {
  const tag = nowTag();
  const emailEmailFlow = `pedro.auth.email.${tag}@example.com`;
  const emailSmsFlow = `pedro.auth.sms.${tag}@example.com`;
  const password = 'Aa123456!';
  const phone = '+5511992590000';

  console.log('step:register_email_flow');
  await registerUser({ email: emailEmailFlow, password, name: 'Pedro Test' });
  const pendingEmail = await prisma.pendingUser.findUnique({ where: { email: emailEmailFlow } });
  if (!pendingEmail?.emailCode) throw new Error('emailCode missing after register');

  console.log('step:verify_email_code');
  const emailVerify = await verifyPendingUserEmail(emailEmailFlow, pendingEmail.emailCode);

  console.log('step:register_sms_flow');
  await registerUser({ email: emailSmsFlow, password, name: 'Pedro SMS' });

  console.log('step:add_phone_pending');
  await addPhoneToPendingUser(emailSmsFlow, phone);
  const pendingSms = await prisma.pendingUser.findUnique({ where: { email: emailSmsFlow } });
  if (!pendingSms?.phoneCode) throw new Error('phoneCode missing after addPhoneToPendingUser');

  console.log('step:verify_phone_code');
  const phoneVerify = await verifyPendingUserPhone(emailSmsFlow, pendingSms.phoneCode);

  console.log(JSON.stringify({
    ok: true,
    emailFlow: {
      email: emailEmailFlow,
      hasAccessToken: Boolean(emailVerify?.tokens?.accessToken),
      hasRefreshToken: Boolean(emailVerify?.tokens?.refreshToken),
      message: emailVerify?.message || null,
    },
    smsFlow: {
      email: emailSmsFlow,
      phone,
      hasAccessToken: Boolean((phoneVerify as any)?.tokens?.accessToken),
      hasRefreshToken: Boolean((phoneVerify as any)?.tokens?.refreshToken),
      userPhoneVerified: Boolean((phoneVerify as any)?.user?.isPhoneVerified),
    },
  }, null, 2));
}

run()
  .catch((e) => {
    console.error('verify_err', e?.message || String(e));
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
