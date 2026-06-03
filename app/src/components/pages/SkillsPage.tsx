import { useState, useEffect } from 'react';
import { Download, Trash2, Search, Package } from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/shared/Button';
import { Input } from '@/components/shared/Input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/shared/Card';
import { ScrollArea } from '@/components/shared/ScrollArea';
import { SkeletonCard } from '@/components/shared/Skeleton';
import { type Skill } from '@/types';

export function SkillsPage() {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'installed' | 'available'>('all');

  useEffect(() => {
    // Simulate loading skills from backend
    const loadSkills = async () => {
      setIsLoading(true);
      try {
        // TODO: Replace with actual API call
        // const skills = await getChatService().getSkills();
        // For now, show empty state
        setSkills([]);
      } catch (error) {
        console.error('Failed to load skills:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadSkills();
  }, []);

  const filteredSkills = skills.filter((skill) => {
    const matchesSearch =
      skill.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      skill.description.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesFilter =
      filter === 'all' ||
      (filter === 'installed' && skill.installed) ||
      (filter === 'available' && !skill.installed);

    return matchesSearch && matchesFilter;
  });

  const handleInstall = (skillId: string) => {
    // TODO: Implement actual installation
    setSkills((prev) =>
      prev.map((skill) =>
        skill.id === skillId ? { ...skill, installed: true } : skill
      )
    );
  };

  const handleUninstall = (skillId: string) => {
    // TODO: Implement actual uninstallation
    setSkills((prev) =>
      prev.map((skill) =>
        skill.id === skillId ? { ...skill, installed: false } : skill
      )
    );
  };

  const installedCount = skills.filter((s) => s.installed).length;
  const availableCount = skills.filter((s) => !s.installed).length;

  return (
    <div className="flex flex-col h-screen bg-muted/40">
      {/* Header */}
      <PageHeader
        icon={Package}
        title="Skills"
        subtitle="Extend OpenSkynet capabilities"
        iconVariant="primary"
        actions={
          <div className="flex items-center gap-2 bg-muted px-3 py-1.5 rounded-lg">
            <Package className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm font-medium text-foreground">{skills.length}</span>
          </div>
        }
      />

      {/* Search & Filter */}
      <div className="p-6 border-b border-border bg-background space-y-4">
        <div className="relative max-w-3xl mx-auto">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search skills..."
            className="pl-9"
          />
        </div>

        <div className="flex gap-2 max-w-3xl mx-auto">
          <Button
            variant={filter === 'all' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilter('all')}
          >
            All ({skills.length})
          </Button>
          <Button
            variant={filter === 'installed' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilter('installed')}
          >
            Installed ({installedCount})
          </Button>
          <Button
            variant={filter === 'available' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilter('available')}
          >
            Available ({availableCount})
          </Button>
        </div>
      </div>

      {/* Skills Grid */}
      <ScrollArea className="flex-1">
        <div className="max-w-5xl mx-auto p-6">
          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <SkeletonCard key={i} showAvatar={false} />
              ))}
            </div>
          ) : filteredSkills.length === 0 ? (
            <div className="text-center py-16">
              <Package className="w-16 h-16 mx-auto mb-4 text-muted-foreground/50" />
              <p className="text-muted-foreground">
                {searchQuery || filter !== 'all'
                  ? 'No skills found matching your criteria'
                  : 'No skills available. Check back soon!'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {filteredSkills.map((skill) => (
                <Card key={skill.id} className="group overflow-hidden">
                  <CardHeader className="pb-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3 flex-1">
                        <div className="w-12 h-12 rounded-lg bg-muted flex items-center justify-center">
                          <Package className="w-6 h-6 text-muted-foreground" />
                        </div>
                        <div className="min-w-0">
                          <CardTitle className="text-base truncate">{skill.name}</CardTitle>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded">
                              v{skill.version}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                    <CardDescription className="text-sm line-clamp-2 mt-2">
                      {skill.description}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4 pt-4">
                    {/* Tags */}
                    <div className="flex flex-wrap gap-1.5">
                      {skill.tags.map((tag) => (
                        <span
                          key={tag}
                          className="text-xs bg-muted text-muted-foreground px-2.5 py-1 rounded-md border border-border"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>

                    {/* Author */}
                    {skill.author && (
                      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                        <span>by</span>
                        <span className="font-medium text-foreground">{skill.author}</span>
                      </div>
                    )}

                    {/* Action Button */}
                    <Button
                      variant={skill.installed ? 'outline' : 'default'}
                      size="sm"
                      className="w-full"
                      onClick={() =>
                        skill.installed
                          ? handleUninstall(skill.id)
                          : handleInstall(skill.id)
                      }
                    >
                      {skill.installed ? (
                        <>
                          <Trash2 className="w-4 h-4 mr-2" />
                          Uninstall
                        </>
                      ) : (
                        <>
                          <Download className="w-4 h-4 mr-2" />
                          Install
                        </>
                      )}
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
