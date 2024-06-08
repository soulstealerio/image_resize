import Resize from '@/components/resize';
import { AppShell, Burger } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import Image from 'next/image';

export default function Home() {
  const [opened, { toggle }] = useDisclosure();

  return (
    <AppShell
      header={{ height: 60 }}
      padding="lg"
    >
      <AppShell.Header>
        <Burger
          opened={opened}
          onClick={toggle}
          hiddenFrom="sm"
          size="sm"
        />
        <div style={{paddingLeft: "10px", paddingTop: "10px"}}>
          <Image 
            alt="Soul Stealer Logo"
            src="/sslogocircle.png"
            width={40}
            height={40}
          />
        </div>
      </AppShell.Header>

      <AppShell.Main>
        <Resize />
      </AppShell.Main>

    </AppShell>
  );
}
