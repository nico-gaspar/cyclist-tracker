import prisma from '../../../lib/prisma.mjs';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const riderParam = searchParams.get('rider');

  if (riderParam) {
    const rider = await prisma.rider.findFirst({
      where: {
        OR: [
          { slug: riderParam },
          { name: { contains: riderParam, mode: 'insensitive' } },
        ],
      },
      include: {
        calendarEntries: {
          orderBy: { date: 'asc' },
        },
      },
    });
    return Response.json({ rider });
  }

  const riders = await prisma.rider.findMany({
    orderBy: { name: 'asc' },
    include: {
      calendarEntries: {
        orderBy: { date: 'asc' },
      },
    },
  });

  return Response.json({ riders });
}
