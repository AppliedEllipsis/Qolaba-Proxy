# Git History Sterilization Plan

## 🚨 **CRITICAL SECURITY ISSUE IDENTIFIED**

The test API key `your-test-api-key-here` is exposed in git history across multiple commits:

### Affected Commits:
1. `f02fd9f` - align timeouts and enhance streaming
2. `d212513` - fix streaming termination and cleanup  
3. `7bdfdab` - fix streaming termination and cleanup
4. `a512abe` - enhance health, streaming, and retry mechanisms
5. `3210fe8` - add initial qoloba proxy server

## 📋 **STERILIZATION PROCEDURE**

### **Phase 1: Backup Repository**
```bash
# Create a full backup before proceeding
git clone d:\AI\qoloba-proxy2 d:\AI\qoloba-proxy2-backup
cd d:\AI\qoloba-proxy2-backup
git remote add backup-origin <original-remote-url>
git push backup-origin --all
git push backup-origin --tags
```

### **Phase 2: Create Replacement File**
Create `secrets.txt` with the following content:
```
your-test-api-key-here==>your-test-api-key-here
```

### **Phase 3: Use BFG Repo-Cleaner**
```bash
# Download BFG Repo-Cleaner
# wget https://repo1.maven.org/maven2/com/madgag/bfg/1.14.0/bfg-1.14.0.jar

# Run BFG to replace the API key in all commits
java -jar bfg-1.14.0.jar --replace-text secrets.txt

# Clean up any remaining references
git reflog expire --expire=now --all
git gc --prune=now --aggressive
```

### **Phase 4: Alternative Method (git filter-branch)**
If BFG is not available:
```bash
# Create a filter script
cat > filter-api-key.sh << 'EOF'
#!/bin/bash
sed -i 's/your-test-api-key-here/your-test-api-key-here/g' "$1"
EOF

chmod +x filter-api-key.sh

# Apply to all commits
git filter-branch --tree-filter 'find . -type f -exec ./filter-api-key.sh {} \;' --tag-name-filter cat -- --all

# Clean up
git reflog expire --expire=now --all
git gc --prune=now --aggressive
rm -rf .git/refs/original/
```

### **Phase 5: Verify Sterilization**
```bash
# Search for any remaining API key occurrences
git log -p --all -S "your-test-api-key-here"

# Should return no results
git grep "your-test-api-key-here" $(git rev-list --all)
```

### **Phase 6: Force Push to Remote**
```bash
# ⚠️ WARNING: This will rewrite history and require force push
git push origin --force --all
git push origin --force --tags
```

## 🔒 **POST-STERILIZATION SECURITY MEASURES**

### **1. Update Repository Settings**
- Enable branch protection rules
- Require pull request reviews
- Enable secret scanning
- Add pre-commit hooks

### **2. Install git-secrets**
```bash
# Install git-secrets
git clone https://github.com/awslabs/git-secrets.git
cd git-secrets
make install
cd ..

# Configure git-secrets
git secrets --register-aws
git secrets --add 'your-test-api-key-here'
git secrets --install
```

### **3. Add Pre-commit Hook**
```bash
# Create pre-commit hook
cat > .git/hooks/pre-commit << 'EOF'
#!/bin/bash
git secrets --scan
EOF

chmod +x .git/hooks/pre-commit
```

## ⚠️ **IMPORTANT NOTES**

1. **Team Coordination**: All team members must be notified before force pushing
2. **Backup Verification**: Ensure backup is complete before proceeding
3. **Remote Repository**: Contact hosting provider if additional cleanup needed
4. **API Key Rotation**: Immediately rotate the exposed API key if still active
5. **Access Audit**: Review all recent API access logs

## 🚀 **IMMEDIATE ACTIONS REQUIRED**

1. **Revoke the exposed API key** in Qolaba platform
2. **Generate new test API key** for development
3. **Update all documentation** with new placeholder
4. **Notify all team members** about the history rewrite
5. **Update any deployed instances** using the old key

## 📊 **VERIFICATION CHECKLIST**

- [ ] API key removed from all files
- [ ] API key removed from git history
- [ ] No occurrences in git log
- [ ] No occurrences in git grep
- [ ] Pre-commit hooks installed
- [ ] git-secrets configured
- [ ] Team notified of changes
- [ ] Backup verified
- [ ] Remote repository updated
- [ ] New API key generated and configured

## 🔄 **RECOVERY PLAN**

If sterilization fails:
1. Restore from backup repository
2. Review and fix the sterilization script
3. Test on a copy of the repository
4. Re-attempt sterilization
5. Verify thoroughly before force pushing

---

**Priority**: CRITICAL  
**Timeline**: IMMEDIATE  
**Risk Level**: HIGH (API key exposure)  
**Impact**: All repository history will be rewritten